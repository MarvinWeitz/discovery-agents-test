// Reflexion of UI promises against server enforcement (Murphy/Notkin style, with the UI annotations
// as the intended model). Reads Fiori annotations from the CSN and matches each one with the rules the
// handler extractor found. Writes UiRule nodes with a verdict:
//   enforced     server allows exactly what the UI allows
//   partial      server checks the same field but allows more than the UI
//   stricter     server allows less than the UI (user sees errors)
//   framework    CAP itself enforces it (@readonly, @mandatory, @assert.range)
//   ui-only      no server rule touches the field: bypassable with a plain OData call
//   consistent   UI refresh hint (SideEffects) matches a server recompute
const fs = require('fs')
const path = require('path')
const { walk } = require('./extract-handlers')

const MANAGED = ['createdAt', 'createdBy', 'modifiedAt', 'modifiedBy']

// Finds the annotation in app/srv/db CDS sources, so the UI side has file:line evidence too
function locator(root) {
  const files = ['app', 'srv', 'db'].flatMap(d => walk(path.join(root, d), p => p.endsWith('.cds')))
  const text = files.map(f => [path.relative(root, f), fs.readFileSync(f, 'utf8').split('\n')])
  return (term, near) => {
    for (const [rel, lines] of text) for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(term)) continue
      if (!near || lines.slice(Math.max(0, i - 4), i + 2).some(l => l.includes(near))) return `${rel}:${i + 1}`
    }
    return null
  }
}

// "$self.TravelStatus.code != #Canceled" → { field: 'TravelStatus', op: '!=', val: 'X' }
function uiCond(xpr, enums) {
  if (!Array.isArray(xpr) || xpr.length !== 3) return null
  const [l, op, r] = xpr
  if (!l?.ref || !['=', '!=', '<>'].includes(op)) return null
  const ref = l.ref.filter(x => x !== '$self' && x !== 'code' && x !== 'in')
  const val = r?.val ?? r?.['#']
  if (r?.['#']) enums[r['#']] = r.val ?? r['#']
  return { field: ref.join('.'), op: op === '<>' ? '!=' : op, val }
}

// Server conditions as written in handler code, reduced to comparisons on a status-like field
function serverConds(text, field, enums) {
  const leaf = field.split('.').pop().replace(/_code$/, '')
  const out = []
  const re = /([\w.?]+)\s*(!==|===|!=|==|=)\s*('([^']*)'|"([^"]*)"|[\w.]+)/g
  for (const m of String(text || '').matchAll(re)) {
    const lhs = m[1].toLowerCase()
    if (!lhs.includes(leaf.toLowerCase()) && !(leaf.toLowerCase().endsWith('status') && /\bstatus\b/.test(lhs))) continue
    let val = m[4] ?? m[5] ?? m[3]
    const sym = val.split('.').pop()
    if (enums[sym] !== undefined) val = enums[sym]
    out.push({ op: m[2].startsWith('!') ? '!=' : '=', val })
  }
  return out
}

const allowedBy = (c, domain) => domain.filter(v => c.op === '=' ? v === c.val : v !== c.val)

function reflexionUi(root, g, csn) {
  const find = locator(root)
  const enums = {}
  const out = { rules: 0, verdicts: {} }
  const add = (id, props, evidence, links = []) => {
    g.node(id, 'UiRule', props, { evidence: evidence || 'unknown', source: 'tool:reflexion-ui', confidence: props.verdict === 'ui-only' ? 'medium' : 'high' })
    for (const [rel, to, ev] of links) g.edge(id, rel, to, {}, { evidence: ev, source: 'tool:reflexion-ui', confidence: 'high' })
    out.rules++; out.verdicts[props.verdict] = (out.verdicts[props.verdict] || 0) + 1
  }
  const handlersFor = (pred) => g.byType('Handler').filter(pred)
  const rulesOf = h => g.out(h.id, 'enforces').map(e => g.nodes.get(e.to)).filter(Boolean)

  // First pass: collect enum symbols (#Open → O) from every OperationAvailable
  for (const [name, def] of Object.entries(csn.definitions))
    for (const a of Object.values(def.actions || {})) uiCond(a['@Core.OperationAvailable']?.xpr, enums)

  for (const [name, def] of Object.entries(csn.definitions)) {
    if (!g.nodes.has(`svcentity:${name}`)) continue
    const short = name.split('.').pop()
    const onEntity = h => h.props.target === name || (h.props.targets || []).includes(name)

    // 1. Actions offered only under a condition
    for (const [an, a] of Object.entries(def.actions || {})) {
      const oa = a['@Core.OperationAvailable']
      if (oa === undefined) continue
      const ui = uiCond(oa.xpr, enums)
      const evidence = find('OperationAvailable', an) || find(an)
      const aid = `action:${name}.${an}`
      const hs = handlersFor(h => g.out(h.id, 'handles').some(e => e.to === aid) || (h.props.events || []).includes(an))
      const rules = hs.flatMap(rulesOf)
      let verdict = 'ui-only', server = 'no rule on this field', links = hs.map(h => ['checked_in', h.id, h.evidence])
      if (ui) {
        const domain = [...new Set(Object.values(enums))]
        const uiAllowed = allowedBy(ui, domain)
        let srvAllowed = [...domain], touched = false
        for (const r of rules) {
          const cs = serverConds(r.props.guard, ui.field, enums)
          if (!cs.length) continue
          touched = true
          links.push(['enforced_by', r.id, r.evidence])
          for (const c of cs) {
            const hit = allowedBy(c, domain)
            // a rejection forbids where its guard holds; a conditional write allows only where it holds
            srvAllowed = r.props.kind === 'rejection' ? srvAllowed.filter(v => !hit.includes(v)) : srvAllowed.filter(v => hit.includes(v))
          }
        }
        if (touched) {
          const extra = srvAllowed.filter(v => !uiAllowed.includes(v)), missing = uiAllowed.filter(v => !srvAllowed.includes(v))
          verdict = !extra.length && !missing.length ? 'enforced' : extra.length ? 'partial' : 'stricter'
          server = `allows ${ui.field} in {${srvAllowed.join(', ')}}` + (extra.length ? `; also ${extra.join(', ')}` : '')
        }
        // effect of the action on the field: UPDATE(...).with({ TravelStatus_code: TravelStatusCode.Accepted })
        let effect = null
        for (const h of hs) for (const w of g.out(h.id, 'writes')) for (const [k, v] of Object.entries(w.props.sets || {}))
          if (k.replace(/_code$/, '') === ui.field.split('.').pop()) { const sym = String(v).split('.').pop().replace(/['"]/g, ''); effect = enums[sym] ?? sym }
        add(`uirule:${name}.${an}:available`, { kind: 'operation-available', entity: name, action: an, field: ui.field, ui: `${ui.field} ${ui.op} ${ui.val}`, domain, uiAllowed, srvAllowed, effect, server, verdict }, evidence, links)
      } else add(`uirule:${name}.${an}:available`, { kind: 'operation-available', entity: name, action: an, ui: oa['='] || JSON.stringify(oa), server, verdict }, evidence, links)
    }

    // 2. Field control: read-only / hidden fields depending on a path
    const fc = Object.entries(def.elements || {}).filter(([, e]) => e['@Common.FieldControl'] !== undefined)
    if (fc.length) {
      const byPath = {}
      for (const [en, e] of fc) (byPath[e['@Common.FieldControl']['='] || JSON.stringify(e['@Common.FieldControl'])] ||= []).push(en)
      for (const [p, els] of Object.entries(byPath)) {
        const root0 = p.split('.').filter(x => x !== 'to_Travel').shift()
        const hs = handlersFor(h => onEntity(h) && (h.props.events || []).some(e => ['UPDATE', 'PATCH', 'EDIT', 'SAVE'].includes(e)))
        const rules = hs.flatMap(rulesOf).filter(r => serverConds(r.props.guard, root0, enums).length || new RegExp(root0, 'i').test(r.props.guard || ''))
        add(`uirule:${name}:fieldcontrol:${p}`, { kind: 'field-control', entity: name, ui: `${els.length} fields controlled by ${p}`, fields: els, server: rules.length ? 'update handler checks it' : 'no update handler checks it', verdict: rules.length ? 'enforced' : 'ui-only' },
          find('FieldControl', els[0]) || find('FieldControl'), rules.map(r => ['enforced_by', r.id, r.evidence]))
      }
    }

    // 3. Create/Delete hidden under a condition
    for (const [ann, events] of [['@UI.CreateHidden', ['CREATE', 'NEW']], ['@UI.DeleteHidden', ['DELETE']]]) {
      const v = def[ann]
      if (v === undefined || v === false) continue
      const cond = v['='] || String(v)
      const hs = handlersFor(h => onEntity(h) && h.props.phase === 'before' && (h.props.events || []).some(e => events.includes(e)))
      const rules = hs.flatMap(rulesOf).filter(r => r.props.kind === 'rejection')
      add(`uirule:${name}:${ann.slice(4)}`, { kind: ann.slice(4), entity: name, ui: `hidden when ${cond}`, server: rules.length ? 'before handler rejects' : `no before ${events.join('/')} rejection`, verdict: rules.length ? 'enforced' : 'ui-only' },
        find(ann.replace('@', '@'), short) || find(ann.slice(1)), rules.map(r => ['enforced_by', r.id, r.evidence]))
    }

    // 4. SideEffects: the UI re-reads targets after a source changes; the server must recompute them
    const se = {}
    for (const [k, v] of Object.entries(def)) {
      const m = k.match(/^@Common\.SideEffects(#\w+)?\.(SourceProperties|SourceEntities|TargetProperties)$/)
      if (m) (se[m[1] || ''] ||= {})[m[2]] = v
    }
    for (const [q, s] of Object.entries(se)) {
      const sources = [...(s.SourceProperties || []), ...(s.SourceEntities || [])].map(x => x['='] || x)
      const targets = (s.TargetProperties || []).map(t => String(t).replace(/^in\//, ''))
      const hs = handlersFor(h => h.props.crud && h.props.phase === 'on' && g.out(h.id, 'writes').some(e => e.to === `svcentity:${name}`))
      const hit = hs.filter(h => !h.props.fields || h.props.fields.some(f => sources.includes(f)) || sources.some(x => x.startsWith('to_')))
      add(`uirule:${name}:sideeffects${q}`, { kind: 'side-effects', entity: name, sources, targets, ui: `${sources.join(', ')} → re-read ${targets.join(', ')}`, server: hit.length ? `recomputed by ${hit.length} handler(s)` : 'no handler writes the targets', verdict: hit.length ? 'consistent' : 'ui-only' },
        find('SideEffects' + q) || find('SideEffects'), hit.map(h => ['enforced_by', h.id, h.evidence]))
    }

    // 5. Constraints CAP enforces itself (skipped on read-only entities, where they promise nothing)
    if (def['@readonly'] || def['@cds.autoexpose']) continue
    for (const [an, a] of Object.entries(def.actions || {}))
      for (const [pn, p] of Object.entries(a.params || {})) {
        const range = p['@assert.range'] || csn.definitions[p.type]?.['@assert.range']
        if (range) add(`uirule:${name}.${an}:${pn}:assert.range`, { kind: 'assert.range', entity: name, action: an, ui: `${pn} in [${range.join(', ')}]`, server: 'CAP generic handler', verdict: 'framework' }, find('@assert.range'))
      }
    const fw = { '@readonly': [], '@mandatory': [], '@assert.range': [] }
    for (const [en, e] of Object.entries(def.elements || {})) {
      if (MANAGED.includes(en) || /^(LastChanged|Draft|IsActiveEntity|HasActiveEntity|HasDraftEntity)/.test(en)) continue
      for (const k of Object.keys(fw)) if (e[k] || (k === '@assert.range' && csn.definitions[e.type]?.['@assert.range'])) fw[k].push(en)
    }
    for (const [k, els] of Object.entries(fw)) if (els.length)
      add(`uirule:${name}:${k.slice(1)}`, { kind: k.slice(1), entity: name, ui: `${els.join(', ')}`, fields: els, server: 'CAP generic handler', verdict: 'framework' }, find(k, els[0]))
  }
  return out
}

module.exports = { reflexionUi, locator }
