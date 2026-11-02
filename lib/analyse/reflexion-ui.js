// Reflexion of UI promises against server enforcement (Murphy/Notkin style, with the UI annotations
// as the intended model). Reads Fiori annotations from the CSN and matches each one with the rules the
// handler extractor found. Writes UiRule nodes with a verdict:
//   enforced     server allows exactly what the UI allows
//   partial      server checks the same field but allows more than the UI
//   stricter     server allows less than the UI (user sees errors)
//   framework    CAP itself enforces it (@readonly, @mandatory, @assert.range)
//   ui-only      no server rule touches the field: bypassable with a plain OData call
//   consistent   UI refresh hint (SideEffects) matches a server recompute
//   dynamic      the server compares the field with a computed value (loop table, parameter): only a request tells
//   unknown      the handler is a reference (require, method) whose body is not read
//   unimplemented  no handler at all (CAP answers 501; reported as action-without-handler)
// Step 4 · Walkthrough: docs/walkthrough/04-ui-promises.md
const { locator } = require('../project/sources')
const { isCodeList } = require('../extract/model')
const { cxnComparisons } = require('./conditions')

const MANAGED = ['createdAt', 'createdBy', 'modifiedAt', 'modifiedBy']

// "$self.TravelStatus.code != #Canceled" → { field: 'TravelStatus', op: '!=', val: 'X' }: the annotation's CXN
// (already parsed by the CDS compiler) read with lib/analyse/conditions.js; one comparison on one field
function uiCond(xpr, enums) {
  const cs = cxnComparisons(xpr).filter(c => ['=', '!='].includes(c.op))
  if (cs.length !== 1 || cxnComparisons(xpr).length !== 1) return null
  const c = cs[0]
  if (c.symbol) enums[c.symbol] = c.rhs
  const ref = c.ref.filter(x => x !== '$self' && x !== 'code' && x !== 'in')
  return { field: ref.join('.'), op: c.op, val: String(c.rhs) }
}

// Server conditions on the field: the comparisons the parsers found (CAP's expression parser for where-clauses,
// the TypeScript syntax tree for if-guards), reduced to = / != on a status-like field. Rules extracted
// without them (older runs) fall back to matching the guard text.
const fieldMatch = (lhs, leaf) => { lhs = lhs.toLowerCase(); return lhs.includes(leaf.toLowerCase()) || (leaf.toLowerCase().endsWith('status') && /\bstatus\b/.test(lhs)) }
function serverConds(rule, field, enums) {
  const leaf = field.split('.').pop().replace(/_code$/, '')
  const value = v => { const sym = String(v).split('.').pop(); return enums[sym] !== undefined ? enums[sym] : v }
  // a comparison with a computed value (order.status !== from) says nothing about which values pass
  if (Array.isArray(rule?.conds)) return rule.conds.filter(c => ['=', '!='].includes(c.op) && c.literal !== false && fieldMatch(c.lhs, leaf)).map(c => ({ op: c.op, val: String(value(c.rhs)) }))
  const out = []
  const re = /([\w.?]+)\s*(!==|===|!=|==|=)\s*('([^']*)'|"([^"]*)"|[\w.]+)/g
  for (const m of String(rule?.guard || '').matchAll(re)) {
    if (!fieldMatch(m[1], leaf)) continue
    out.push({ op: m[2].startsWith('!') ? '!=' : '=', val: String(value(m[4] ?? m[5] ?? m[3])) })
  }
  return out
}

const allowedBy = (c, domain) => domain.filter(v => c.op === '=' ? v === c.val : v !== c.val)

// @Core.OperationAvailable in OData JSON syntax ({ $edmJson: { $Eq: [{ $Path: 'in/status_code' }, 'S'] } }) arrives
// in the CSN flattened ("@Core.OperationAvailable.$edmJson.$Eq"). Rebuilt here as the CXN the CDS expression syntax
// gives ((in.status_code = 'S')), so both spellings are read alike. Only $Eq / $Ne / $Not / $And / $Or with $Path.
const EDM_OPS = { $Eq: '=', $Ne: '!=', $Gt: '>', $Ge: '>=', $Lt: '<', $Le: '<=' }
function edmJson(a, ann) {
  const pre = `${ann}.$edmJson`
  let obj = a[ann]?.$edmJson
  if (!obj) {
    const keys = Object.keys(a).filter(k => k.startsWith(pre + '.'))
    if (!keys.length) return undefined
    obj = {}
    for (const k of keys) { const path = k.slice(pre.length + 1).split('.'); let o = obj; path.slice(0, -1).forEach(p => { o = o[p] ||= {} }); o[path[path.length - 1]] = a[k] }
  }
  const opnd = x => x && typeof x === 'object' && x.$Path ? { ref: String(x.$Path).split('/') } : x && typeof x === 'object' && '$EnumMember' in x ? { val: String(x.$EnumMember).split('/').pop() } : { val: x }
  const cxn = o => {
    if (!o || typeof o !== 'object') return null
    for (const [k, op] of Object.entries(EDM_OPS)) if (Array.isArray(o[k])) return [opnd(o[k][0]), op, opnd(o[k][1])]
    if (o.$Not) { const x = cxn(o.$Not); return x && ['not', ...x] }
    for (const [k, w] of [['$And', 'and'], ['$Or', 'or']]) if (Array.isArray(o[k])) { const parts = o[k].map(cxn); return parts.every(Boolean) ? [{ xpr: parts[0] }, w, { xpr: parts[1] }] : null }
    if (o.$Path) return [opnd(o), '=', { val: true }]
    return null
  }
  const xpr = cxn(obj)
  const text = JSON.stringify(obj).replace(/[{}"[\]]/g, '').replace(/\$Path:/g, '').replace(/,/g, ' ')
  return xpr ? { xpr, '=': text } : { '=': text }
}

// values a status-like field can take: its own enum, or the enum of the code list it points to
function enumValues(csn, def, field) {
  const vals = e => e?.enum ? Object.entries(e.enum).map(([k, v]) => v?.val ?? k) : []
  const leaf = String(field).split('.').pop()
  const el = def.elements?.[leaf]
  if (el?.enum) return vals(el)
  const assoc = def.elements?.[leaf.replace(/_code$/, '')]
  const target = assoc?.target && csn.definitions[assoc.target]
  return vals(target?.elements?.code)
}

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
  const opAvailable = a => a['@Core.OperationAvailable'] !== undefined ? a['@Core.OperationAvailable'] : edmJson(a, '@Core.OperationAvailable')
  for (const [name, def] of Object.entries(csn.definitions))
    for (const a of Object.values(def.actions || {})) uiCond(opAvailable(a)?.xpr, enums)

  for (const [name, def] of Object.entries(csn.definitions)) {
    if (!g.nodes.has(`svcentity:${name}`)) continue
    const short = name.split('.').pop()
    const onEntity = h => h.props.target === name || (h.props.targets || []).includes(name)

    // 1. Actions offered only under a condition
    for (const [an, a] of Object.entries(def.actions || {})) {
      const oa = opAvailable(a)
      if (oa === undefined) continue
      const ui = uiCond(oa.xpr, enums)
      const evidence = find('OperationAvailable', new RegExp(`\\b(action|function)\\s+${an}\\b`), true) || find('OperationAvailable', an) || find(an)
      const aid = `action:${name}.${an}`
      const hs = handlersFor(h => g.out(h.id, 'handles').some(e => e.to === aid) || (h.props.events || []).includes(an))
      const rules = hs.flatMap(rulesOf)
      let verdict = 'ui-only', server = 'no rule on this field', links = hs.map(h => ['checked_in', h.id, h.evidence])
      // no handler at all: CAP answers 501 in every state, so the server does not "accept" anything (action-without-handler reports it)
      const unimplemented = !hs.length && !g.in(aid, 'handles').length
      if (ui) {
        // the values the field can take: enum symbols seen in annotations, the field's (code list) enum, and the literals
        // every OperationAvailable on this entity compares it with
        const literals = Object.values(def.actions || {}).map(x => uiCond(opAvailable(x)?.xpr, {})).filter(c => c && c.field === ui.field).map(c => c.val)
        const domain = [...new Set([...Object.values(enums), ...enumValues(csn, def, ui.field), ...literals].map(String))]
        const uiAllowed = allowedBy(ui, domain)
        let srvAllowed = [...domain], touched = false
        for (const r of rules) {
          const cs = serverConds(r.props, ui.field, enums)
          if (!cs.length) continue
          touched = true
          links.push(['enforced_by', r.id, r.evidence])
          for (const c of cs) {
            const hit = allowedBy(c, domain)
            // a rejection forbids where its guard holds; a conditional write allows only where it holds
            srvAllowed = r.props.kind === 'rejection' ? srvAllowed.filter(v => !hit.includes(v)) : srvAllowed.filter(v => hit.includes(v))
          }
        }
        if (unimplemented) { srvAllowed = []; verdict = 'unimplemented'; server = 'no handler: CAP answers 501 in every state' }
        else if (touched) {
          const extra = srvAllowed.filter(v => !uiAllowed.includes(v)), missing = uiAllowed.filter(v => !srvAllowed.includes(v))
          verdict = !extra.length && !missing.length ? 'enforced' : extra.length ? 'partial' : 'stricter'
          server = `allows ${ui.field} in {${srvAllowed.join(', ')}}` + (extra.length ? `; also ${extra.join(', ')}` : '')
        } else if (rules.some(r => (r.props.conds || []).some(c => c.literal === false && fieldMatch(c.lhs, ui.field.split('.').pop().replace(/_code$/, ''))))) {
          verdict = 'dynamic'; server = `compares ${ui.field} with a computed value (a table, a parameter): a request settles it`
        } else if (hs.some(h => h.props.opaque)) {
          verdict = 'unknown'; server = 'the handler is passed as a reference (require, method) whose body the parser does not read'
        }
        // effect of the action on the field: UPDATE(...).with({ TravelStatus_code: TravelStatusCode.Accepted })
        let effect = null
        for (const h of hs) for (const w of g.out(h.id, 'writes')) for (const [k, v] of Object.entries(w.props.sets || {}))
          if (k.replace(/_code$/, '') === ui.field.split('.').pop()) { const sym = String(v).split('.').pop().replace(/['"]/g, ''); effect = enums[sym] ?? sym }
        add(`uirule:${name}.${an}:available`, { kind: 'operation-available', entity: name, action: an, field: ui.field, ui: `${ui.field} ${ui.op} ${ui.val}`, domain, uiAllowed, srvAllowed, effect, server, verdict }, evidence, links)
      } else {
        if (unimplemented) { verdict = 'unimplemented'; server = 'no handler: CAP answers 501 in every state' }
        else if (hs.some(h => h.props.opaque)) { verdict = 'unknown'; server = 'the handler is passed as a reference whose body the parser does not read' }
        add(`uirule:${name}.${an}:available`, { kind: 'operation-available', entity: name, action: an, ui: oa['='] || JSON.stringify(oa), server, verdict }, evidence, links)
      }
    }

    // 2. Field control: read-only / hidden fields depending on a path
    // static #ReadOnly and #Mandatory are enforced by CAP itself, like @readonly and @mandatory (CAP input validation)
    const STATIC_FC = { ReadOnly: 'readonly', Mandatory: 'mandatory' }
    const staticFc = {}
    for (const [en, e] of Object.entries(def.elements || {})) { const k = STATIC_FC[e['@Common.FieldControl']?.['#']]; if (k) (staticFc[k] ||= []).push(en) }
    for (const [k, els] of Object.entries(staticFc))
      add(`uirule:${name}:fieldcontrol-${k}`, { kind: `fieldcontrol-${k}`, entity: name, ui: `${els.join(', ')} (@Common.FieldControl: #${k === 'readonly' ? 'ReadOnly' : 'Mandatory'})`, fields: els, server: 'CAP generic handler', verdict: 'framework' }, find('FieldControl', els[0]) || find('FieldControl'))
    const fc = Object.entries(def.elements || {}).filter(([, e]) => e['@Common.FieldControl'] !== undefined && !STATIC_FC[e['@Common.FieldControl']?.['#']])
    if (fc.length) {
      const byPath = {}
      for (const [en, e] of fc) (byPath[e['@Common.FieldControl']['='] || JSON.stringify(e['@Common.FieldControl'])] ||= []).push(en)
      for (const [p, els] of Object.entries(byPath)) {
        // the field the path ends on, after navigation to other entities (to_Travel.TravelStatus.code → TravelStatus);
        // a segment is navigation when the CSN element is an association to an entity that is not a code list
        let at = def, segs = p.split('.')
        while (segs.length > 1 && at?.elements?.[segs[0]]?.target && !isCodeList(csn.definitions[at.elements[segs[0]].target])) at = csn.definitions[at.elements[segs.shift()].target]
        const root0 = segs[0]
        const hs = handlersFor(h => onEntity(h) && (h.props.events || []).some(e => ['UPDATE', 'PATCH', 'EDIT', 'SAVE'].includes(e)))
        const rules = hs.flatMap(rulesOf).filter(r => serverConds(r.props, root0, enums).length || new RegExp(root0, 'i').test(r.props.guard || ''))
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

module.exports = { reflexionUi }
