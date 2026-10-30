// Phase 5 test design: equivalence classes from the graph, each with an expected outcome and,
// where the graph allows it, a concrete OData request a generated cds.test can send.
// Categories follow the technique that fits the rule: decision table, state machine, boundary,
// role x operation, reflexion (UI promise vs server), combinatorial (all pairs).
const { matrix, short } = require('./authz')
const { loadSeed } = require('./seed-data')

const ODATA = s => s.props.path

// Deterministic all-pairs (greedy, seeded), same idea as PICT
function pairwise(F, seed = 7) {
  let x = seed; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648
  const key = (r, i, j) => `${i}:${r[i]}|${j}:${r[j]}`
  const pairs = new Set()
  F.forEach((a, i) => F.forEach((b, j) => { if (j > i) a[1].forEach((_, p) => b[1].forEach((_, q) => pairs.add(`${i}:${p}|${j}:${q}`))) }))
  const rows = []
  while (pairs.size) {
    let best = null, bs = -1
    for (let t = 0; t < 40; t++) {
      const r = F.map(f => Math.floor(rnd() * f[1].length))
      const [a, b] = [...pairs][0].split('|').map(s => s.split(':').map(Number)); r[a[0]] = a[1]; r[b[0]] = b[1]
      for (let k = 0; k < F.length; k++) {
        if (k === a[0] || k === b[0]) continue
        let bv = r[k], bc = -1
        for (let v = 0; v < F[k][1].length; v++) { r[k] = v; let c = 0; for (let j = 0; j < F.length; j++) if (j !== k && pairs.has(key(r, Math.min(j, k), Math.max(j, k)))) c++; if (c > bc) { bc = c; bv = v } }
        r[k] = bv
      }
      let sc = 0; for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) if (pairs.has(key(r, i, j))) sc++
      if (sc > bs) { bs = sc; best = r.slice() }
    }
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) pairs.delete(key(best, i, j))
    rows.push(best)
  }
  return rows
}

function design(g, root, meta = {}) {
  const seed = loadSeed(root)
  const auth = matrix(g, meta)
  const svcOf = name => g.byType('Service').find(s => name.startsWith(s.props.name + '.'))
  const entityPath = name => { const s = svcOf(name); return s ? `${ODATA(s)}/${name.slice(s.props.name.length + 1)}` : null }
  const keyOf = (name, where) => {
    const n = g.nodes.get(`svcentity:${name}`); if (!n) return null
    const src = n.props.projectsOn || name
    const rows = seed[src]?.rows || []
    const row = rows.find(r => Object.entries(where || {}).every(([k, v]) => r[k] === v))
    if (!row || !n.props.keys?.length) return null
    const k = n.props.keys.map(k => `${k}=${/UUID|ID$/.test(k) && !/^\d+$/.test(row[k]) && !/^[0-9a-f-]{36}$/i.test(row[k]) ? `'${row[k]}'` : /^[0-9a-f-]{36}$/i.test(row[k]) ? row[k] : `'${row[k]}'`}`)
    return { segment: `(${k.join(',')}${n.props.draft ? ',IsActiveEntity=true' : ''})`, row, file: seed[src].file }
  }
  const covered = (entity, words) => {
    for (const t of g.byType('ExistingTest')) {
      if (!g.out(t.id, 'mentions').some(e => e.to === `svcentity:${entity}`)) continue
      const norm = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '')
      const hit = (t.props.names || []).find(n => words.some(w => w && norm(w).length > 3 && norm(n).includes(norm(w))))
      if (hit) return `${t.props.file}: "${hit}"`
    }
    return null
  }
  const cats = []
  const cat = (n, k, why) => { const c = { n, k, why, classes: [] }; cats.push(c); return c }

  // 1. Authorization: one class per (operation, outcome) with a representative user
  const A = cat('Authorization', 'role × operation', `${auth.rows.length} operations × ${auth.users.length} users, grouped by outcome`)
  for (const r of auth.rows) {
    const groups = {}
    r.c.forEach((c, i) => (groups[c.v] ||= []).push(auth.users[i]))
    for (const [v, us] of Object.entries(groups)) {
      const u = us.find(x => !x.anon) || us[0]
      const expect = v === 'n' ? (u.anon ? 401 : 403) : v === 'r' ? (u.anon ? 401 : 403) : 200
      // auto-exposed composition children are only reachable through their parent (a top-level GET is 405)
      const sid = `svcentity:${r.entity}`, child = g.nodes.get(sid)?.props.autoexposed && g.in(sid, 'composes').length
      const path = r.entity && !child ? entityPath(r.entity) : null
      A.classes.push({ id: `AUT:${r.op}:${v}`, dim: { entity: r.entity ? short(r.entity) : r.op.split(':')[0], op: r.token, state: null, users: us.map(x => x.id) }, fact: `auth:${r.op}`, name: `${r.op} as ${us.map(x => x.id).join('/')}`, input: `user ${u.id}`, expected: v === 'r' ? `${expect} (today 200: open)` : v === 'a' ? 'verify' : String(expect),
        user: u.anon ? null : u.id, req: path && r.token === 'READ' ? { method: 'GET', path: `${path}?$top=1`, status: expect, today: v === 'r' ? 200 : expect, spec: v === 'r' } : null,
        covered_by: r.c.some((c, i) => c.t && groups[v].includes(auth.users[i])) ? 'existing test (same user + entity)' : null })
    }
  }

  // 2. UI promises vs server (reflexion): try the thing the UI hides, through OData
  const U = cat('UI vs server rules', 'reflexion', 'one class per UI promise; ui-only and partial ones are negative tests')
  for (const r of g.byType('UiRule')) {
    const p = r.props
    if (p.kind === 'operation-available') {
      const s = svcOf(p.entity)
      for (const st of (p.domain || []).filter(v => !(p.uiAllowed || []).includes(v))) {
        const k = keyOf(p.entity, { [`${p.field}_code`]: st })
        U.classes.push({ id: `UIS:${p.action}:${st}`, dim: { entity: short(p.entity), op: p.action, state: st }, fact: r.id, name: `${p.action} on ${p.field} = ${st} (UI hides it)`, input: k ? `${short(p.entity)} ${JSON.stringify(k.row[Object.keys(k.row)[0]])}` : `${short(p.entity)} with ${p.field}=${st}`,
          expected: '4xx rejection', today: (p.srvAllowed || []).includes(st) ? 'accepted (UI-only rule)' : 'rejected', verdict: p.verdict,
          req: k ? { method: 'POST', path: `${entityPath(p.entity)}${k.segment}/${s.props.name}.${p.action}`, body: {}, status: 400, today: (p.srvAllowed || []).includes(st) ? 'success' : 'error', spec: true, seed: k.file } : null,
          covered_by: covered(p.entity, [p.action]) })
      }
    } else if (['ui-only', 'partial'].includes(p.verdict)) {
      U.classes.push({ id: `UIS:${p.kind}:${short(p.entity)}`, dim: { entity: short(p.entity), op: p.kind, state: null }, fact: r.id, name: `${short(p.entity)}: ${p.ui} — bypass via OData`, input: 'PATCH/POST on a non-open instance', expected: '4xx rejection', today: 'accepted (UI-only rule)', verdict: p.verdict, covered_by: null })
    } else U.classes.push({ id: `UIS:${p.kind}:${short(p.entity)}:${U.classes.length}`, dim: { entity: short(p.entity), op: p.kind, state: null }, fact: r.id, name: `${short(p.entity)}: ${p.ui}`, input: p.kind, expected: p.kind === 'side-effects' ? 'targets recomputed' : 'CAP rejects / ignores', verdict: p.verdict, covered_by: covered(p.entity, (p.fields || []).concat([p.ui.split(' ')[0]])) })
  }

  // 3. State machine: every (action, state) pair, valid and invalid
  const S = cat('Status transitions', 'state machine', 'each action from each state')
  const TR = []
  for (const r of g.byType('UiRule').filter(r => r.props.kind === 'operation-available' && r.props.domain)) {
    for (const st of r.props.domain) {
      const ui = r.props.uiAllowed.includes(st) ? 1 : 0, node = r.props.srvAllowed.includes(st) ? 1 : 0
      TR.push({ f: st, t: node ? (r.props.effect ?? st) : st, a: r.props.action, ui, node })
      S.classes.push({ id: `STA:${r.props.action}:${st}`, dim: { entity: short(r.props.entity), op: r.props.action, state: st }, fact: r.id, name: `${r.props.action} from ${st}`, input: `${r.props.field}=${st}`, expected: ui ? `→ ${r.props.effect ?? st}` : 'rejected', today: node ? `→ ${r.props.effect ?? st}` : 'rejected', covered_by: ui ? covered(r.props.entity, [r.props.action]) : null })
    }
  }

  // 4. Rules in handlers: rejections (guard true / false), derivations, conditional writes
  const R = cat('Handler rules', 'decision table', 'each rejection: guard true and false; each derivation and conditional write: condition true and false')
  for (const r of g.byType('Rule')) {
    const h = g.nodes.get(r.props.handler); if (!h) continue
    const ent = h.props.target || (g.out(h.id, 'handles').map(e => g.nodes.get(e.to)).find(n => n?.type === 'Action')?.id || '').replace(/^action:/, '').split('.').slice(0, -1).join('.')
    const where = `${h.props.phase} ${h.props.events.join('/')} ${short(ent || h.props.service)}`
    const dim = { entity: short(ent || h.props.service), op: h.props.events.join('/'), state: null }
    if (r.props.kind === 'rejection') {
      R.classes.push({ id: `RUL:${r.id}:t`, dim, fact: r.id, name: `${where}: ${r.props.message || 'reject'}`, input: r.props.guard || 'always', expected: `${r.props.status || 400} "${(r.props.message || '').slice(0, 60)}"`, evidence: r.evidence, covered_by: covered(ent, [r.props.message?.split(' ').slice(0, 3).join(' ')]) })
      if (r.props.guard) R.classes.push({ id: `RUL:${r.id}:f`, dim, fact: r.id, name: `${where}: guard false`, input: `!(${r.props.guard})`, expected: 'passes', evidence: r.evidence, covered_by: null })
    } else if (r.props.kind === 'derivation') {
      R.classes.push({ id: `RUL:${r.id}:t`, dim, fact: r.id, name: `${where}: derive ${r.props.field}`, input: r.props.guard || 'always', expected: `${r.props.field} = ${(r.props.expr || '').slice(0, 50)}`, evidence: r.evidence, covered_by: covered(ent, [r.props.field]) })
      if (r.props.guard) R.classes.push({ id: `RUL:${r.id}:f`, dim, fact: r.id, name: `${where}: ${r.props.field} untouched`, input: `!(${r.props.guard})`, expected: `${r.props.field} as sent`, evidence: r.evidence, covered_by: null })
    } else if (r.props.kind === 'conditional-write') {
      R.classes.push({ id: `RUL:${r.id}:t`, dim, fact: r.id, name: `${where}: write when ${r.props.guard}`, input: r.props.guard, expected: 'row updated', evidence: r.evidence, covered_by: covered(ent, ['discount', short(ent)]) })
      R.classes.push({ id: `RUL:${r.id}:f`, dim, fact: r.id, name: `${where}: no write`, input: `!(${r.props.guard})`, expected: 'nothing updated, error explains why', evidence: r.evidence, covered_by: null })
    }
  }

  // 5. Framework constraints: boundaries CAP checks generically
  const F = cat('Framework constraints', 'boundary', '@mandatory missing/present, @readonly ignored, @assert.range below/min/max/above')
  for (const r of g.byType('UiRule').filter(r => r.props.verdict === 'framework')) {
    const p = r.props
    if (p.kind === 'mandatory') for (const f of p.fields) F.classes.push({ id: `FW:${p.entity}:${f}`, dim: { entity: short(p.entity), op: 'mandatory', state: null }, fact: r.id, name: `${short(p.entity)}: save without ${f}`, input: `${f} missing`, expected: '400 on activate', covered_by: null })
    if (p.kind === 'readonly') F.classes.push({ id: `FW:${p.entity}:ro`, dim: { entity: short(p.entity), op: 'readonly', state: null }, fact: r.id, name: `${short(p.entity)}: write ${p.fields.join(', ')}`, input: 'client sends read-only fields', expected: 'values ignored', covered_by: null })
    if (p.kind === 'assert.range') for (const b of ['below min', 'min', 'max', 'above max']) F.classes.push({ id: `FW:${p.action}:${b}`, dim: { entity: short(p.entity), op: p.action, state: null }, fact: r.id, name: `${p.action}: ${p.ui.split(' ')[0]} ${b}`, input: b, expected: /above|below/.test(b) ? '400 out of range' : 'accepted', covered_by: null })
  }

  // 6. Draft lifecycle per draft root
  const D = cat('Draft lifecycle', 'state × user', 'new → activate, edit → discard, edit while another user holds the draft')
  for (const n of g.byType('ServiceEntity').filter(n => n.props.draft)) for (const [k, e] of [['new-activate', 'active row created'], ['edit-discard', 'active row unchanged'], ['foreign-lock', '423 / locked']])
    D.classes.push({ id: `DRF:${n.props.name}:${k}`, dim: { entity: short(n.id), op: 'draft', state: k }, fact: n.id, name: `${short(n.id)}: ${k.replace('-', ' → ')}`, input: k, expected: e, covered_by: k === 'new-activate' ? covered(n.props.name, ['draft', 'activation', 'create']) : null })

  // 7. Combinatorial: the action with the most rules, factors from params, guarded fields, status and target
  let DD = null
  const actions = g.byType('UiRule').filter(r => r.props.kind === 'operation-available')
  const ruleCount = a => g.byType('Handler').filter(h => h.props.events.includes(a)).reduce((s, h) => s + g.out(h.id, 'enforces').length, 0)
  const top = actions.sort((a, b) => ruleCount(b.props.action) - ruleCount(a.props.action))[0]
  if (top && ruleCount(top.props.action) >= 2) {
    const act = g.nodes.get(`action:${top.props.entity}.${top.props.action}`)
    const range = g.byType('UiRule').find(r => r.props.kind === 'assert.range' && r.props.action === top.props.action)
    const factors = [], invalid = {}, boundary = {}
    for (const p of act?.props.params || []) {
      const [lo, hi] = range ? range.props.ui.match(/\[(.*)\]/)[1].split(',').map(Number) : [null, null]
      const vals = lo !== null ? ['null', String(lo - 1), String(lo), String(Math.round((lo + hi) / 2)), String(hi), String(hi + 1)] : ['null', 'valid']
      factors.push([p, vals]); invalid[p] = ['null', String(lo - 1), String(hi + 1)]; boundary[p] = [String(lo), String(hi)]
    }
    factors.push([top.props.field, top.props.domain]); invalid[top.props.field] = top.props.domain.filter(v => !top.props.srvAllowed.includes(v))
    const guardFields = [...new Set(g.byType('Handler').filter(h => h.props.events.includes(top.props.action)).flatMap(h => g.out(h.id, 'enforces').map(e => g.nodes.get(e.to)?.props.guard || '')).join(' ').match(/\b(\w+)\s*(?:==|!=)\s*null/g)?.map(m => m.split(/\s/)[0]) || [])]
    for (const f of guardFields) { factors.push([f, ['null', '0', '> 0']]); invalid[f] = ['null'] }
    factors.push(['target', ['active', 'draft']], ['repeat', ['first', 'again']])
    const rows = pairwise(factors)
    const rules = [...Object.entries(invalid).flatMap(([f, vs]) => vs.map(v => ({ when: { [f]: v }, expect: f === top.props.field ? 'rejected (status)' : f === factors[0]?.[0] ? '400 invalid parameter' : '4xx precondition', tone: f === factors[0]?.[0] ? 'r' : 'a' }))),
      ...top.props.domain.filter(v => !top.props.uiAllowed.includes(v) && top.props.srvAllowed.includes(v)).map(v => ({ when: { [top.props.field]: v }, expect: 'accepted today; UI hides it', tone: 'r' }))]
    DD = { action: top.props.action, factors, invalid, boundary, rules, fallback: ['success', 'y'], full: factors.reduce((a, f) => a * f[1].length, 1), pairs: rows.length }
    const C = cat(`${top.props.action} combinations`, 'combinatorial', `all pairs over ${factors.length} factors (${DD.full} full)`)
    rows.forEach((r, i) => {
      const vals = Object.fromEntries(r.map((v, k) => [factors[k][0], factors[k][1][v]]))
      const hit = rules.find(x => Object.entries(x.when).every(([f, v]) => vals[f] === v))
      C.classes.push({ id: `CMB:${top.props.action}:${i + 1}`, dim: { entity: short(top.props.entity), op: top.props.action, state: vals[top.props.field] }, name: Object.entries(vals).map(([k, v]) => `${k}=${v}`).join(', '), input: vals, expected: hit ? hit.expect : 'success', covered_by: null })
    })
  }
  for (const c of cats) { c.cls = c.classes.length; c.cov = c.classes.filter(x => x.covered_by).length }
  return { categories: cats.filter(c => c.cls), auth, TR, DD }
}

module.exports = { design, pairwise }
