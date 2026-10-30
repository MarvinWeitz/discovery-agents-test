// Builds every atlas section from a discovery run. One builder per section; each reads only the
// graph, the compiled CSN and files in the app, so the output is deterministic for a commit.
// Agent or human findings (risks, notes) come in through the curated base and are marked as such.
const fs = require('fs')
const path = require('path')
const { matrix, piiFields, short } = require('./authz')
const { design, pairwise } = require('./test-design')
const { detectPatterns } = require('./patterns')
const { detectRisks } = require('./risks')
const { loadSeed } = require('./seed-data')
const { walk } = require('./extract-handlers')

const base = f => path.basename(f)
const hev = h => `${base(h.props.file)}:${h.props.line}`
const uniq = a => [...new Set(a)]
const cut = (t, n) => { t = String(t ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t }
// entity a handler works on; for action handlers the entity that owns the bound action
const tgtOf = (g, h) => h.props.target || g.out(h.id, 'handles').map(e => e.to).find(t => t.startsWith('action:'))?.replace(/^action:/, '').split('.').slice(0, -1).join('.') || h.props.service

// ---------- UIS ----------
const PV = {
  enforced: ['=', 'y', 'server enforces it'], consistent: ['=', 'y', 'server recomputes it'], framework: ['⚙', 'y', 'CAP enforces it'],
  stricter: ['≈', 'a', 'server stricter than UI'], partial: ['≈', 'a', 'server enforces part'], 'ui-only': ['✕', 'r', 'UI promise, server open']
}
function uis(g) {
  const label = r => {
    const p = r.props, e = short(p.entity)
    return {
      'operation-available': `${p.action} offered only if ${p.ui}`, 'field-control': `${e}: ${p.ui}`, CreateHidden: `New ${e} ${p.ui}`, DeleteHidden: `Delete ${e} ${p.ui}`,
      'side-effects': `${e}: ${p.ui}`, readonly: `${e}: read-only ${p.ui}`, mandatory: `${e}: required ${p.ui}`, 'assert.range': `${p.action}: ${p.ui}`
    }[p.kind] || `${e}: ${p.kind}`
  }
  const order = Object.keys(PV)
  const rows = g.byType('UiRule').sort((a, b) => order.indexOf(b.props.verdict) - order.indexOf(a.props.verdict))
    .map(r => [label(r), r.props.ui, r.props.server, r.props.verdict, [r.evidence, ...g.out(r.id, 'enforced_by').map(e => g.nodes.get(e.to)?.evidence).filter(Boolean)].slice(0, 3).join(' · ')])
  return { PARITY: rows, PV }
}

// ---------- API ----------
function api(g) {
  const out = []
  const guarded = new Set(g.edges.filter(e => e.rel === 'requires').map(e => e.from))
  const rootOf = id => { const p = g.edges.find(x => x.rel === 'composes' && x.to === id && x.from !== id); return p ? rootOf(p.from) : id }
  for (const s of g.byType('Service')) {
    const sets = [], acts = []
    for (const e of g.out(s.id, 'exposes')) {
      const n = g.nodes.get(e.to); if (!n || n.props.generated || n.id.endsWith('.texts')) continue
      const root = rootOf(n.id), parentGuarded = root !== n.id && guarded.has(root)
      const access = guarded.has(n.id) || guarded.has(s.id) ? 'auth' : parentGuarded ? 'auth?' : 'open'
      const pii = piiFields(n)
      const methods = parentGuarded ? 'via ' + short(root) + ' draft' : n.props.readonly || n.props.autoexposed || n.props.codeList ? 'GET' : 'GET POST PATCH DELETE'
      sets.push([short(n.id), methods, access, [n.props.draft && 'draft', pii.length && `PII: ${pii.join(', ')}`, n.props.autoexposed && !parentGuarded && 'auto-exposed'].filter(Boolean).join(' · ')])
      for (const a of g.out(n.id, 'has_action')) {
        const an = g.nodes.get(a.to)
        const roles = g.out(n.id, 'requires').filter(r => String(r.props.grant).split(',').some(x => x === '*' || x === an.props.name)).map(r => short(r.to))
        acts.push([an.props.name, roles.join(', ') || (guarded.has(s.id) ? 'service role' : 'none'), g.in(an.id, 'handles').length ? '' : 'no handler', short(n.id)])
      }
    }
    for (const a of g.byType('Action').filter(a => a.id.startsWith(`action:${s.props.name}.`) && !a.props.bound))
      acts.push([a.props.name, g.out(s.id, 'requires').map(r => short(r.to)).join(', ') || 'none', g.in(a.id, 'handles').length ? 'unbound' : 'unbound · no handler', null])
    out.push({ root: s.props.path, svc: short(s.id), sets: sets.sort((a, b) => (b[3].includes('PII') - a[3].includes('PII')) || a[0].localeCompare(b[0])), acts })
  }
  return out
}

// ---------- DAT ----------
function dat(g, root) {
  const seed = loadSeed(root)
  const ents = g.byType('Entity').filter(n => !n.id.endsWith('.texts'))
  const svcOf = id => g.edges.filter(e => e.rel === 'projects_on' && e.to === id).map(e => g.nodes.get(e.from)).filter(Boolean)
  const draftRoots = new Set(ents.filter(n => svcOf(n.id).some(s => s.props.draft)).map(n => n.id))
  const inDraft = new Set(), walkC = id => { for (const e of g.out(id, 'composes')) if (!inDraft.has(e.to) && !e.to.endsWith('.texts')) { inDraft.add(e.to); walkC(e.to) } }
  for (const r of draftRoots) { inDraft.add(r); walkC(r) }
  const kind = n => n.props.codeList ? 'cl' : n.props.name.startsWith('sap.common.') ? 'cm' : inDraft.has(n.id) ? 'tx' : 'md'
  const ENT = ents.map(n => [short(n.id), kind(n), Math.min(14, (n.props.elementNames || []).length), draftRoots.has(n.id) ? 'draft root' : inDraft.has(n.id) ? 'composition' : piiFields(n).length ? 'PII' : null, piiFields(n).length ? 1 : 0, (n.props.elementNames || []).filter(x => !/_code$|_ID$|^ID$|UUID$|^(createdAt|createdBy|modifiedAt|modifiedBy|LastChangedAt|LastChangedBy|LocalLastChangedAt)$|^to_|^Is|^Has|Draft/.test(x)).slice(0, 3)])
  const names = new Set(ENT.map(e => e[0]))
  const REL = []
  for (const e of g.edges.filter(e => (e.rel === 'composes' || e.rel === 'associates') && e.from.startsWith('entity:') && e.to.startsWith('entity:'))) {
    const f = short(e.from), t = short(e.to)
    if (!names.has(f) || !names.has(t) || f === t) continue
    if (!REL.some(r => r[0] === f && r[1] === t)) REL.push([f, t, e.rel === 'composes' ? 'comp' : 'as', e.props.element])
  }
  const grantsOn = n => g.out(n.id, 'requires').length || g.in(n.id, 'exposes').some(e => g.out(e.from, 'requires').length)
  const DAT_ROWS = ents.map(n => {
    const svcs = svcOf(n.id)
    const exposed = uniq(svcs.map(s => s.props.service + (s.props.autoexposed ? ' (auto)' : '')))
    const pii = piiFields(n).length
    const guarded = svcs.some(grantsOn), inherits = !guarded && inDraft.has(n.id) && !draftRoots.has(n.id)
    const restrict = !svcs.length ? 'n' : pii && svcs.some(s => !grantsOn(s)) && !inherits ? 'r' : guarded ? 'y' : inherits ? 'a' : pii ? 'r' : 'n'
    const hooks = g.byType('Handler').filter(h => (h.props.targets || [h.props.target]).some(t => svcs.some(s => s.props.name === t))).length
    const rows = seed[n.props.name]?.rows.length || 0
    return [short(n.id), kind(n), draftRoots.has(n.id) ? 'y' : 'n', exposed.join(', ') || 'not exposed', restrict, pii ? (svcs.some(s => !grantsOn(s)) && !inherits ? 'r' : 'y') : 'n', String(hooks), String(rows)]
  }).sort((a, b) => ['tx', 'md', 'cl', 'cm'].indexOf(a[1]) - ['tx', 'md', 'cl', 'cm'].indexOf(b[1]))
  return { ENT, REL, DAT_ROWS }
}

// ---------- DEP ----------
function dep(g) {
  const files = g.byType('CdsFile')
  const order = { app: 0, srv: 1, db: 2, ext: 3 }
  const rows = {}
  const FILES = files.map(f => ({ f, l: f.props.path.startsWith('@') || !/^(app|srv|db)\//.test(f.props.path) ? 'ext' : f.props.layer }))
    .sort((a, b) => order[a.l] - order[b.l] || a.f.props.path.localeCompare(b.f.props.path))
    .map(({ f, l }) => { rows[l] = (rows[l] ?? -1) + 1; const p = f.props.path; const nm = p.split('/').length > 3 ? `${p.split('/')[0]}/…/${base(p)}` : p; return [p, nm, l, rows[l]] })
  const ids = new Set(FILES.map(f => f[0]))
  const rank = { bad: 2, skip: 1, ok: 0 }
  const M = {}
  for (const e of g.edges.filter(e => ['uses', 'annotates', 'extends'].includes(e.rel))) {
    const a = e.from.replace('cdsfile:', ''), b = e.to.replace('cdsfile:', '')
    if (!ids.has(a) || !ids.has(b) || a === b) continue
    const k = a + '>' + b, v = e.props.verdict || 'ok'
    if (!M[k] || rank[v] > rank[M[k][2]]) M[k] = [a, b, v, e.props.why || null, e.evidence]
  }
  return { FILES, DEPS: Object.values(M) }
}

// ---------- FLW ----------
const VERB = { UPDATE: 'PATCH', CREATE: 'POST', NEW: 'POST', DELETE: 'DELETE', SAVE: 'POST draftActivate', READ: 'GET' }
function flw(g) {
  const hs = g.byType('Handler')
  const sideFx = g.byType('UiRule').filter(r => r.props.kind === 'side-effects')
  const N = [], L = [], idx = n => { let i = N.indexOf(n); if (i < 0) { N.push(n); i = N.length - 1 } return i }
  const entFields = {}
  const flows = []
  for (const h of hs) {
    const writes = g.out(h.id, 'writes').filter(w => w.props.sets && Object.keys(w.props.sets).length)
    const ders = g.out(h.id, 'enforces').map(e => g.nodes.get(e.to)).filter(r => r?.props.kind === 'derivation')
    if (!writes.length && !ders.length) continue
    const trig = !h.props.events.some(e => VERB[e]) ? `${h.props.events.join('/')} on ${short(tgtOf(g, h))}` : `${h.props.events.map(e => VERB[e] || e).join('/')} ${short(tgtOf(g, h))}${h.props.drafts ? ' (draft)' : ''}`
    const hn = `${h.props.phase} · ${hev(h)}`
    for (const w of writes) flows.push([trig, hn, short(w.to), Object.keys(w.props.sets)])
    for (const r of ders) flows.push([trig, hn, short(tgtOf(g, h)), [r.props.field]])
  }
  for (const [, , e, fs] of flows) entFields[e] = uniq([...(entFields[e] || []), ...fs])
  const entNode = e => `${e}: ${entFields[e].slice(0, 3).join(', ')}${entFields[e].length > 3 ? ', …' : ''}`
  const add = (a, b, v) => { const s = idx(a), t = idx(b); const l = L.find(x => x[0] === s && x[1] === t); if (l) l[2] += v; else L.push([s, t, v]) }
  for (const [trig, hn, e, fs] of flows) { add(trig, hn, fs.length); add(hn, entNode(e), fs.length) }
  for (const r of sideFx) {
    const e = short(r.props.entity); if (!entFields[e]) continue
    const tg = (r.props.targets || []).filter(t => entFields[e].includes(t)).length || 1
    add(entNode(e), 'SideEffects re-read', tg)
  }
  // swimlane: the handler with the most writes and rules
  const score = h => g.out(h.id, 'writes').reduce((a, w) => a + Object.keys(w.props.sets || {}).length, 0) + g.out(h.id, 'enforces').length
  const top = [...hs].sort((a, b) => score(b) - score(a) || a.props.line - b.props.line)[0]
  let SWIM = null
  if (top && score(top)) {
    const ent = short(tgtOf(g, top)), ev0 = top.props.events[0]
    const steps = [{ a: 0, b: 2, t: VERB[ev0] ? `${VERB[ev0]} ${ent}${top.props.drafts ? '(draft)' : ''}` : `POST ${ent}(…)/${ev0}`, c: 'ac' }]
    const items = [
      ...g.out(top.id, 'enforces').map(e => g.nodes.get(e.to)).filter(Boolean).map(r => ({ line: +r.evidence.split(':').pop(), r })),
      ...g.out(top.id, 'writes').map(w => ({ line: +String(w.evidence).split(':').pop(), w }))
    ].sort((a, b) => a.line - b.line)
    if (top.props.phase === 'on' && top.props.delegates) steps.push({ a: 2, b: 3, t: 'next(): default write' })
    for (const it of items.slice(0, 6)) {
      if (it.r?.props.kind === 'rejection') steps.push({ a: 2, b: 0, t: `${it.r.props.guard ? 'if ' + cut(it.r.props.guard, 44) + ': ' : ''}reject ${it.r.props.status || 400}${it.r.props.message ? ' "' + cut(it.r.props.message, 30) + '"' : ''}`, sub: it.r.evidence, c: 'cr' })
      else if (it.r?.props.kind === 'derivation') steps.push({ a: 2, b: 3, t: `${it.r.props.field} = ${cut(it.r.props.expr, 40)}`, sub: it.r.evidence })
      else if (it.r) steps.push({ a: 2, b: 3, t: `${it.r.props.kind === 'conditional-write' ? 'write only if' : it.r.props.kind} ${cut(it.r.props.guard, 54)}`, sub: it.r.evidence })
      else { const s = Object.entries(it.w.props.sets || {}); steps.push({ a: 2, b: 3, t: `${it.w.props.via} ${short(it.w.to)}${s.length ? ' SET ' + cut(s.map(([k]) => k).join(', '), 50) : ''}`, sub: it.w.evidence }) }
    }
    steps.push({ a: 2, b: 0, t: '200 OK' })
    const fx = sideFx.find(r => short(r.props.entity) === ent)
    if (fx) { steps.push({ a: 0, b: 1, t: cut(`SideEffects: ${fx.props.ui}`, 70), sub: fx.evidence, c: 'wn' }); steps.push({ a: 0, b: 2, t: `GET ${ent}(…) re-read targets`, c: 'ac' }) }
    SWIM = { title: `${top.props.phase} ${top.props.events.join('/')} ${ent}`, handler: `${top.props.phase} ${top.props.events.join('/')}`, ev: hev(top), lanes: ['Fiori UI', 'SideEffects', `${short(top.props.service)} · Node`, 'Database'], steps }
  }
  // hooks per draft event
  const EV = ['NEW draft', 'PATCH draft', 'DELETE', 'SAVE (activate)', 'CREATE / UPDATE', 'READ', 'Actions']
  const col = h => {
    const c = new Set()
    for (const e of h.props.events) c.add(e === 'NEW' ? 0 : e === 'UPDATE' && h.props.drafts ? 1 : e === 'DELETE' ? 2 : e === 'SAVE' || e === 'draftActivate' ? 3 : ['CREATE', 'UPDATE', '*'].includes(e) ? 4 : e === 'READ' ? 5 : 6)
    return [...c]
  }
  const NODE = EV.map(() => []), UI = EV.map(() => [])
  for (const h of hs) for (const c of col(h)) NODE[c].push([`${h.props.phase} ${h.props.events.join('/')} ${short(tgtOf(g, h))}`, hev(h)])
  const ucol = { CreateHidden: 0, 'field-control': 1, 'side-effects': 1, DeleteHidden: 2, mandatory: 3, readonly: 4, 'operation-available': 6, 'assert.range': 6 }
  for (const r of g.byType('UiRule')) { const c = ucol[r.props.kind]; if (c === undefined) continue; UI[c].push([`${r.props.kind === 'operation-available' ? r.props.action + ': ' : ''}${r.props.ui}`.slice(0, 48), r.evidence ? `${base(r.evidence.split(':')[0])}:${r.evidence.split(':').pop()}` : 'annotation', r.props.verdict === 'ui-only' ? 1 : 0]) }
  const keep = EV.map((_, i) => NODE[i].length || UI[i].length)
  return { SANKEY_NODES: N, SANKEY_LINKS: L, SWIM, HOOK_EVENTS: EV.filter((_, i) => keep[i]), HOOK_NODE: NODE.filter((_, i) => keep[i]), HOOK_UI: UI.filter((_, i) => keep[i]) }
}

// ---------- STA ----------
function sta(g, root, csn, TR) {
  const rules = g.byType('UiRule').filter(r => r.props.kind === 'operation-available' && r.props.domain)
  if (!rules.length) return { TR: [], STATES: null }
  const field = rules[0].props.field, entity = rules[0].props.entity
  const codes = uniq(rules.flatMap(r => r.props.domain))
  const seed = loadSeed(root)
  const cl = Object.keys(seed).find(k => k.endsWith('.' + field) || k.endsWith('-' + field))
  const names = Object.fromEntries((seed[cl]?.rows || []).map(r => [r.code, r.name || r.descr || r.code]))
  const se = g.nodes.get(`svcentity:${entity}`)
  const dbe = csn.definitions[se?.props.projectsOn || entity]
  const el = dbe?.elements?.[field] || dbe?.elements?.[field + '_code']
  const def = el?.default?.val ?? (el?.keys ? dbe.elements[field + '_code']?.default?.val : undefined)
  const ev = Object.fromEntries(rules.map(r => [r.props.action, [r.evidence, ...g.out(r.id, 'enforced_by').concat(g.out(r.id, 'checked_in')).map(e => g.nodes.get(e.to)?.evidence)].filter(Boolean)]))
  return { TR: TR.map(t => ({ ...t, ev: ev[t.a] || [] })), STATES: { field, entity: short(entity), codes, names, default: def ?? null } }
}

// ---------- AUT ----------
function aut(g, auth) {
  const ROLES = auth.users.map(u => [u.id, u.anon ? 'anonymous' : `${u.id} · ${u.roles.filter(r => g.nodes.has(`role:${r}`)).join(', ') || 'no role'}${u.tested ? ' · tests' : ''}`])
  const AUTH = auth.rows.map(r => ({ op: r.op, svc: r.service, ev: r.ev, note: r.note, c: r.c.map(c => (c.t ? { v: c.v, t: 1 } : c.v)) }))
  // every READ path into personal data
  const piiEnt = new Map(g.byType('Entity').filter(n => piiFields(n).length).map(n => [n.id, n]))
  const ep = []
  for (const r of auth.rows.filter(r => r.token === 'READ' && r.entity)) {
    const sn = g.nodes.get(`svcentity:${r.entity}`); if (!sn) continue
    const path = (g.byType('Service').find(s => s.props.name === sn.props.service)?.props.path || '') + '/' + short(sn.id)
    const dbId = g.out(sn.id, 'projects_on')[0]?.to
    if (piiEnt.has(dbId)) ep.push({ path, ent: short(dbId), via: 'direct', c: r.c.map(c => c.v) })
    for (const a of g.out(dbId || '', 'associates').filter(a => piiEnt.has(a.to))) ep.push({ path: `${path}?$expand=${a.props.element}`, ent: short(a.to), via: 'expand', c: r.c.map(c => c.v) })
  }
  const PIIREACH = { users: ROLES.map(r => r[1]), endpoints: ep.slice(0, 8), entities: uniq(ep.map(e => e.ent)).map(n => [n, piiFields(piiEnt.get([...piiEnt.keys()].find(k => short(k) === n)))]) }
  // users → roles → grants
  const grants = g.edges.filter(e => e.rel === 'requires')
  const appRoles = uniq(grants.map(e => short(e.to)).filter(r => !['any', 'authenticated-user', 'system-user'].includes(r)))
  const G = {}
  for (const e of grants) { const k = `${e.props.grant === '*' ? 'all ops' : String(e.props.grant).split(',').join(' · ')} ${short(e.from)}`; (G[k] ||= { label: k, roles: [], ev: e.evidence }).roles.push(short(e.to)) }
  const openN = auth.rows.filter(r => r.c[0].v !== 'n' && !r.note).length
  const CHAIN = { users: auth.users.filter(u => !u.anon).map(u => [u.id, u.roles.filter(r => appRoles.includes(r)), u.tested ? 1 : 0]), roles: appRoles,
    grants: [...Object.values(G).map(x => [x.label, uniq(x.roles)]), ...(openN ? [[`${openN} operations need no role`, ['any']]] : [])] }
  return { ROLES, AUTH, PIIREACH, CHAIN }
}

// ---------- ARC ----------
function arc(g, root, metrics) {
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const has = f => fs.existsSync(path.join(root, f))
  const zones = []
  const apps = g.byType('UI5App')
  const xs = has('xs-security.json') ? JSON.parse(fs.readFileSync(path.join(root, 'xs-security.json'), 'utf8')) : null
  zones.push({ label: 'UI · app/*/webapp', boxes: [
    ...apps.map(a => ({ id: a.id, t: a.props.id.split('.').pop(), lines: [uniq(g.out(a.id, 'has_route').map(r => String(g.nodes.get(r.to)?.props.template || '').split('.').pop())).filter(Boolean).join(' + ') || (a.props.fioriElements ? 'Fiori elements' : 'freestyle'), ...(g.out(a.id, 'has_view').length ? [`§${g.out(a.id, 'has_view').length} extension views`] : [])], cls: 'ac' })),
    ...(xs ? [{ id: 'xsuaa', t: 'XSUAA', lines: [`${(xs.scopes || []).length} scopes · ${(xs['role-templates'] || []).length} templates`], cls: 'sk' }] : [])] })
  const svcs = g.byType('Service')
  zones.push({ label: 'ODATA SERVICES · srv/*.cds', boxes: svcs.map(s => {
    const ex = g.out(s.id, 'exposes').map(e => g.nodes.get(e.to)).filter(n => n && !n.props.generated && !n.id.endsWith('.texts'))
    const gr = g.out(s.id, 'requires').length + ex.reduce((a, n) => a + g.out(n.id, 'requires').length, 0)
    const pii = ex.some(n => piiFields(n).length)
    return { id: s.id, t: `${short(s.id)} ${s.props.path}`, lines: [`${ex.length} entity sets${ex.some(n => n.props.draft) ? ' · draft' : ''} · ${ex.reduce((a, n) => a + g.out(n.id, 'has_action').length, 0)} actions`, gr ? `§${gr} grants` : '§no @requires / @restrict'], cls: !gr && pii ? 'cr' : '' }
  }) })
  const files = g.byType('SourceFile').filter(f => g.in(f.id, 'implemented_in').length)
  const typer = f => { try { return /#cds-models/.test(fs.readFileSync(path.join(root, f.props.path), 'utf8')) } catch { return false } }
  zones.push({ label: 'RUNTIME · CAP NODE.JS', boxes: [
    ...files.map(f => { const hs = g.byType('Handler').filter(h => h.props.file === f.props.path); return { id: f.id, t: f.props.path, lines: [`${hs.length} handlers · ${hs.reduce((a, h) => a + g.out(h.id, 'enforces').length, 0)} rules`, ...(typer(f) ? ['§cds-typer · TypeScript'] : [])], cls: 'ac' } }),
    ...svcs.filter(s => !g.out(s.id, 'implemented_in').length).map(s => ({ id: 'generic:' + s.id, t: `${short(s.id)}: generic`, lines: ['CAP default handlers only'], cls: 'sk' })),
    ...g.byType('ExternalService').map(r => ({ id: r.id, t: r.props.name, lines: [r.props.kind], cls: 'sk' })),
    ...g.byType('MessagingBroker').map(r => ({ id: r.id, t: r.props.name, lines: [r.props.kind || 'messaging'], cls: 'sk' }))] })
  const req = JSON.stringify(pj.cds?.requires || {}) + (has('.cdsrc.json') ? fs.readFileSync(path.join(root, '.cdsrc.json'), 'utf8') : '')
  const dbs = []
  if (/hana/.test(req) || g.byType('DbArtifact').length || /@cap-js\/hana|@sap\/hana-client/.test(JSON.stringify(pj.dependencies || {}))) dbs.push({ id: 'db:hana', t: 'SAP HANA (HDI)', lines: [`${g.byType('DbArtifact').length} native artifacts`] })
  if (/sqlite/.test(req + JSON.stringify(pj.devDependencies || {}) + JSON.stringify(pj.dependencies || {}))) dbs.push({ id: 'db:sqlite', t: 'SQLite', lines: ['local dev + tests'], cls: 'sk' })
  const seeds = ['db/data', 'db/csv', 'test/data'].flatMap(d => walk(path.join(root, d), p => p.endsWith('.csv'))).length
  zones.push({ label: `PERSISTENCE${has('mta.yaml') ? ' · mta.yaml' : ''}`, boxes: [{ id: 'model', t: 'CDS model db/', lines: [`${g.byType('Entity').filter(n => !n.id.endsWith('.texts')).length} entities · ${seeds} CSV seeds`], cls: 'sk' }, ...dbs] })
  const links = []
  for (const a of apps) for (const e of g.out(a.id, 'uses')) if (g.nodes.get(e.to)?.type === 'Service') links.push([a.id, e.to, 'OData V' + String(e.props.odataVersion || '4').split('.')[0]])
  for (const s of svcs) { for (const e of g.out(s.id, 'implemented_in')) links.push([s.id, e.to, '']); if (!g.out(s.id, 'implemented_in').length) links.push([s.id, 'generic:' + s.id, '']) }
  for (const b of zones[2].boxes.filter(b => b.cls === 'ac' || b.id.startsWith('generic:'))) links.push([b.id, dbs[0]?.id || 'model', ''])
  // layer stack
  const lint = g.byType('Finding')
  const appCds = g.byType('CdsFile').filter(f => f.props.layer === 'app')
  const bad = g.edges.filter(e => ['annotates', 'extends', 'uses'].includes(e.rel) && e.props.verdict === 'bad')
  const hs = g.byType('Handler'), ents = g.byType('Entity').filter(n => !n.id.endsWith('.texts'))
  const ui = g.byType('UiRule')
  const ex = g.byType('ServiceEntity').filter(n => !n.props.generated && !n.id.endsWith('.texts'))
  const openPii = ex.filter(n => piiFields(n).length && !g.out(n.id, 'requires').length && !g.out(`service:${n.props.service}`, 'requires').length)
  const n = (v, w) => `${v} ${w}`
  const ARC_LAYERS = [
    ['UI', 'app/*/webapp', [n(apps.length, 'UI5 apps'), n(g.byType('Route').length, 'routes'), n(g.byType('View').length, 'extension views'), n(g.byType('ExistingTest').filter(t => t.props.kind === 'ui-opa5').length, 'OPA journeys')],
      [lint.filter(f => f.props.severity === 'error').length && `cr:${lint.filter(f => f.props.severity === 'error').length} UI5 lint errors`, lint.filter(f => f.props.severity !== 'error').length && `wn:${lint.filter(f => f.props.severity !== 'error').length} UI5 lint warnings`].filter(Boolean)],
    ['Annotations', `app/**/*.cds · ${appCds.reduce((a, f) => a + f.props.lines, 0).toLocaleString('en')} lines`, appCds.sort((a, b) => b.props.lines - a.props.lines).slice(0, 6).map(f => `${base(f.props.path).replace('.cds', '')} ${f.props.lines}`),
      uniq(bad.filter(e => e.from.startsWith('cdsfile:app/')).map(e => `cr:${e.props.why}`))],
    ['Services', 'srv/*.cds', [...svcs.map(s => short(s.id)), n(ex.length, 'entity sets'), n(g.byType('Action').length, 'actions')],
      [...openPii.map(x => `cr:${short(x.id)} PII open`), ...g.byType('Action').filter(a => !g.in(a.id, 'handles').length).map(a => `wn:${a.props.name} w/o code`)].slice(0, 4)],
    ['Logic', uniq(hs.map(h => h.props.file)).join(', ') || 'none', [`ac:${hs.length} handlers`, n(g.byType('Rule').length, 'rules'), n(g.byType('Helper').length, 'helpers')],
      [ui.filter(r => r.props.verdict === 'ui-only').length && `wn:${ui.filter(r => r.props.verdict === 'ui-only').length} UI-only rules`, ui.filter(r => r.props.verdict === 'partial').length && `wn:${ui.filter(r => r.props.verdict === 'partial').length} partial`].filter(Boolean)],
    ['Domain', 'db/*.cds', Object.entries({ tx: 'draft documents', md: 'master data', cl: 'code lists', cm: 'common' }).map(([k, l]) => n(ents.filter(e => (e.props.codeList ? 'cl' : e.props.name.startsWith('sap.common.') ? 'cm' : e.props.draft || g.edges.some(x => x.rel === 'projects_on' && x.to === e.id && g.nodes.get(x.from)?.props.draft) ? 'tx' : 'md') === k).length, l)).filter(x => !x.startsWith('0 ')),
      uniq(ents.filter(e => piiFields(e).length).map(e => `${openPii.some(x => x.props.projectsOn === e.props.name) ? 'cr' : 'gd'}:${short(e.id)} PII`))],
    ['Persistence', 'db/data' + (g.byType('DbArtifact').length ? ' · db/src (HDI)' : ''), [...dbs.map(d => d.t), n(seeds, 'CSV seeds')], []],
    ['Platform', [has('mta.yaml') && 'mta.yaml', has('xs-security.json') && 'xs-security.json', has('app/router/xs-app.json') && 'approuter'].filter(Boolean).join(' · ') || 'none found',
      [xs && `XSUAA ${(xs.scopes || []).length} scopes`, ...(metrics.auth?.kinds || [])].filter(Boolean), []]
  ]
  return { ARC: { zones, links }, ARC_LAYERS }
}

// ---------- TST ----------
function tst(g, td) {
  const TESTCATS = td.categories.map(c => ({ n: c.n, k: c.k, cls: c.cls, cov: c.cov, why: c.why }))
  const CLASSES = td.categories.flatMap(c => c.classes.map(x => [c.n, x.id, x.name, typeof x.input === 'object' ? Object.entries(x.input).map(([k, v]) => `${k}=${v}`).join(', ') : x.input, x.expected, x.today || '', x.covered_by || '', x.req ? 'yes' : '']))
  let DD = null
  if (td.DD) {
    const rows = pairwise(td.DD.factors)
    DD = { action: td.DD.action, factors: td.DD.factors, invalid: td.DD.invalid, boundary: td.DD.boundary, rules: td.DD.rules, fallback: td.DD.fallback, full: td.DD.full, rows }
  }
  const tests = g.byType('ExistingTest'), svc = tests.filter(t => t.props.kind === 'service'), opa = tests.filter(t => t.props.kind === 'ui-opa5')
  const users = uniq(svc.flatMap(t => t.props.runsAs))
  const TEST_NOTE = `Existing suite: ${svc.reduce((a, t) => a + t.props.cases, 0)} service tests in ${svc.length} files (users: ${users.join(', ') || 'none set'}), ${opa.reduce((a, t) => a + t.props.cases, 0)} OPA5 steps in ${opa.length} journeys.`
  return { TESTCATS, CLASSES, DD, TEST_NOTE }
}

// ---------- all ----------
function buildAtlas({ g, csn, root, metrics, curated = {} }) {
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const meta = { restrictAll: metrics.auth?.restrictAll, root }
  const auth = matrix(g, meta)
  const td = design(g, root, meta)
  const D = {}
  Object.assign(D, arc(g, root, metrics), dat(g, root), dep(g), flw(g), sta(g, root, csn, td.TR), aut(g, auth), uis(g), tst(g, td))
  D.API = api(g)
  D.PATTERNS = detectPatterns(root, g, csn)
  D.LAYERS = [['ui', 'UI5 apps'], ['ann', 'Annotations'], ['srv', 'Services'], ['node', 'Node logic'], ['db', 'Domain / DB'], ['cfg', 'Config / tests']]
  const gen = detectRisks(g, meta)
  // agent findings: kept unless a rule now finds the same thing (curated risk.gen names the rule key)
  const keys = new Set(gen.map(r => r.key))
  const agent = (curated.RISKS || []).filter(r => !(r.gen && [].concat(r.gen).some(k => keys.has(k)))).map(r => ({ ...r, src: 'agent' }))
  D.RISKS = [...gen, ...agent]
  const sources = Object.fromEntries(['ARC', 'DAT', 'DEP', 'FLW', 'STA', 'AUT', 'PAT', 'UIS', 'TST', 'API'].map(k => [k, 'generated']))
  sources.RSK = agent.length ? 'generated + agent' : 'generated'

  const ui = D.PARITY.filter(p => p[3] === 'ui-only').length
  const ok = D.PARITY.filter(p => ['enforced', 'consistent', 'framework'].includes(p[3])).length
  const part = D.PARITY.filter(p => ['partial', 'stricter'].includes(p[3])).length
  const bad = D.DEPS.filter(d => d[2] === 'bad').length
  const cls = D.TESTCATS.reduce((a, c) => a + c.cls, 0), cov = D.TESTCATS.reduce((a, c) => a + c.cov, 0)
  const sets = D.API.reduce((a, s) => a + s.sets.length, 0), open = D.API.reduce((a, s) => a + s.sets.filter(x => x[2] === 'open').length, 0)
  const hs = g.byType('Handler').length
  const apps = g.byType('UI5App'), svcs = g.byType('Service')
  const openPii = D.API.some(s => s.sets.some(x => x[2] === 'open' && x[3].includes('PII')))
  const top = [...D.RISKS].sort((a, b) => b.i * b.l - a.i * a.l)[0]
  D.KPIS = [[String(apps.length), 'UI5 apps'], [String(svcs.length), 'OData services'], [String(D.ENT.length), 'entities'], [String(hs), 'Node handlers'], [String(D.PATTERNS.length), 'coding patterns'],
    [String(bad), 'layer violations', bad ? 'w' : ''], [`${ui} / ${D.PARITY.length}`, 'UI rules the server skips', ui ? 'c' : ''], [String(D.RISKS.length), 'risks with evidence', 'c'], [String(cls), 'equivalence classes'], [String(cov), 'covered today', 'w']]
  const S = []
  const sec = (code, name, take, views) => S.push({ code, name, take, views: views.filter(Boolean).map(([k, label]) => ({ k, label })) })
  sec('ARC', 'Architecture', `${apps.length} UI5 app${apps.length === 1 ? '' : 's'} on ${svcs.length} OData service${svcs.length === 1 ? '' : 's'}, served by one CAP Node.js process with ${hs} handlers.${ui ? ` <b>${ui} business rules are promised by UI annotations only</b>, not enforced by the server.` : ''}`, [['A', 'Container map'], ['B', 'Layer stack']])
  sec('DAT', 'Data model', `${D.ENT.length} entities: ${D.ENT.filter(e => e[1] === 'tx').length} in draft documents, ${D.ENT.filter(e => e[1] === 'md').length} master data, ${D.ENT.filter(e => e[1] === 'cl').length} code lists.${D.ENT.some(e => e[4]) ? ` Personal data in <b>${D.ENT.filter(e => e[4]).map(e => e[0]).join(', ')}</b>.` : ''}`, [['A', 'Composition tree'], ['B', 'Force graph'], ['C', 'Entity matrix']])
  sec('DEP', 'Dependencies', `${D.FILES.length} CDS files, ${D.DEPS.length} file-to-file dependencies. ${bad ? `<b>${bad} reach past their layer</b>` : 'No layer violations'}${D.DEPS.some(d => d[2] === 'skip') ? `, ${D.DEPS.filter(d => d[2] === 'skip').length} put UI annotations straight on the domain` : ''}.`, [['A', 'Layered graph'], ['B', 'Dependency matrix']])
  sec('FLW', 'Data flow & events', `${D.SANKEY_LINKS.length ? `${uniq(D.SANKEY_NODES.filter(n => n.includes(': '))).length} entities get fields written by handlers` : 'No handler writes fields'}${D.SWIM ? `; the busiest handler is <b>${D.SWIM.title}</b> (${D.SWIM.ev})` : ''}. ${D.HOOK_EVENTS.length} lifecycle events carry server or UI hooks.`,
    [D.SANKEY_LINKS.length && ['A', 'Sankey'], D.SWIM && ['B', 'Swimlane: ' + D.SWIM.title], ['C', 'Hook timeline']])
  if (D.STATES) sec('STA', `${D.STATES.field} lifecycle`, `${D.STATES.codes.length} states, ${D.TR.length} action × state pairs. The UI allows ${D.TR.filter(t => t.ui).length}, the Node server ${D.TR.filter(t => t.node).length}; <b>${D.TR.filter(t => t.ui !== t.node).length} disagree</b>.`, [['A', 'State machine'], ['B', 'Transition table']])
  sec('AUT', 'Authorization', `${D.ROLES.length} users (anonymous plus mock users) × ${D.AUTH.length} operations. ${D.AUTH.filter(a => a.c.some(c => (c.v || c) === 'r')).length ? `<b>${D.AUTH.filter(a => a.c.some(c => (c.v || c) === 'r')).length} operations expose personal data without a role.</b>` : 'No personal data is open.'} ${D.AUTH.reduce((a, r) => a + r.c.filter(c => c.t).length, 0)} cells are exercised by existing tests.`, [['A', 'Role heatmap'], D.PIIREACH.endpoints.length && ['B', 'PII reach'], D.CHAIN.roles.length && ['C', 'Role chain']])
  sec('PAT', 'Coding patterns', `${D.PATTERNS.length} patterns found by fixed detectors. ${D.PATTERNS.filter(p => p.h === 'cr').length} cause a defect or exposure, ${D.PATTERNS.filter(p => p.h === 'wn').length} work but sit in the wrong place.`, [['A', 'Pattern cards'], ['B', 'Pattern × layer']])
  if (D.PARITY.length) sec('UIS', 'UI promises vs server', `${D.PARITY.length} rules the UI promises, read from the annotations. ${ok} are enforced by the server or by CAP, ${part} only partly${ui ? `; <b>${ui} exist only in the UI</b> and can be bypassed with a plain OData call` : ''}.`, [['A', 'Reflexion matrix'], ['B', 'Verdict bars']])
  sec('RSK', 'Risks', `${D.RISKS.length} risks: ${gen.length} found by rules, ${agent.length} by agent review. Highest: <b>${top ? top.t : 'none'}</b>${top ? ` (score ${top.i * top.l})` : ''}.`, [['A', 'Impact × likelihood'], ['B', 'Ranked cards']])
  sec('TST', 'Test design', `${cls} equivalence classes in ${D.TESTCATS.length} categories; <b>${cov} covered by existing tests</b>.${D.DD ? ` ${D.DD.action}: ${D.DD.rows.length} all-pairs cases instead of ${D.DD.full}.` : ''}`, [['A', 'Coverage treemap'], D.DD && ['B', `${D.DD.action} classes`], ['C', 'Coverage bars']])
  sec('API', 'Interfaces', `${D.API.length} service roots, ${sets} entity sets, ${D.API.reduce((a, s) => a + s.acts.length, 0)} actions. <b>${open} sets need no role</b>${openPii ? ', including personal data' : ''}.`, [['A', 'Endpoint map'], ['B', 'Interface list']])
  D.SECTIONS = S
  const name = (curated.META?.title) || `${String(pj.name || path.basename(root)).replace(/^@[^/]+\//, '').replace(/^./, c => c.toUpperCase())} Discovery Atlas`
  const repo = typeof pj.repository === 'string' ? pj.repository : pj.repository?.url
  const lede = `${apps.length} UI5 app${apps.length === 1 ? '' : 's'} (${apps.filter(a => a.props.fioriElements).length} Fiori elements), ${svcs.length} OData services, ${D.ENT.length} entities and a CAP Node.js backend with ${hs} handlers, read end to end from the code.`
  D.META = { title: name, app: curated.META?.app || pj.name, url: curated.META?.url || (repo || '').replace(/^git\+/, '').replace(/\.git$/, ''), license: curated.META?.license || pj.license || 'unknown', scope: 'CAP Node.js only', run: String(metrics.run).slice(0, 10), commit: metrics.commit,
    lede: curated.META?.lede ? curated.META.lede : lede, sources }
  return { D, td }
}

module.exports = { buildAtlas }
