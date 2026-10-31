// Coverage by equivalence class: which business cases (entity × operation × state) a test exercises,
// not which lines ran. Sources, strongest first:
//   generated   a cds.test from bin/gen-tests.js built for exactly this class (manifest.json)
//   measured    the app's own tests, run in CI with the recorder (addon measured), sent a request to the
//               same entity and operation as a user of the class: measured, replaces the text scan below
//   request     an existing test's source text sends a request to the same entity and operation (scan, approximate)
//   name        an existing test's name mentions the entity and the rule (test-design covered_by, approximate)
// Status per class: tested · spec (today's behaviour pinned, intended one only as it.skip) · fail ·
// likely (request without the state or guard branch, or name match) · gen (generated, not run yet) · none
const fs = require('fs')
const path = require('path')

const STATUS = ['tested', 'gen', 'spec', 'likely', 'fail', 'none']
const LABEL = { tested: 'tested', gen: 'generated, not run yet', spec: 'spec only (today pinned)', likely: 'likely (approximate match)', fail: 'test fails', none: 'untested' }
const VERB = { GET: 'READ', POST: 'CREATE', PATCH: 'UPDATE', PUT: 'UPDATE', DELETE: 'DELETE' }
// handler events and auth tokens that a request with this op exercises
const SAME = { CREATE: ['CREATE', 'NEW', 'UPDATE', 'DELETE', 'SAVE'], UPDATE: ['UPDATE', 'CREATE'], READ: ['READ'], DELETE: ['DELETE', 'CREATE'], draftActivate: ['SAVE', 'CREATE', 'draft'], draftEdit: ['EDIT', 'draft'] }

// requests in existing service tests: { file, line, method, entity, op, users }
function scanRequests(g, root) {
  const svcs = g.byType('Service').map(s => ({ path: s.props.path, name: s.props.name }))
  const sets = new Set(g.byType('ServiceEntity').map(e => e.props.name.split('.').pop()))
  const actions = new Map(g.byType('Action').map(a => [a.props.name, a.id.replace(/^action:/, '').split('.').slice(-2, -1)[0]]))
  const out = []
  for (const t of g.byType('ExistingTest').filter(t => t.props.kind === 'service')) {
    let src; try { src = fs.readFileSync(path.join(root, t.props.file), 'utf8') } catch { continue }
    // variables holding a path, e.g. const Draft = `/processor/Travel(...)` → resolve the entity later
    const vars = {}
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[`'"]\/(\w+)\/(\w+)/g)) if (sets.has(m[3])) vars[m[1]] = m[3]
    src.split('\n').forEach((ln, i) => {
      for (const m of ln.matchAll(/\b(GET|POST|PATCH|PUT|DELETE)\s*\(?\s*([`'"]?)(.*)/g)) {
        const rest = m[3]
        const lit = rest.match(/^\/?(\w+)\/(\w+)/) || []
        let entity = m[2] && svcs.some(s => s.path === '/' + lit[1]) && sets.has(lit[2]) ? lit[2] : null
        if (!entity) { const v = rest.match(/^(\w+)/); if (v && vars[v[1]]) entity = vars[v[1]] }
        const act = [...rest.matchAll(/\.(\w+)/g)].map(x => x[1]).find(a => actions.has(a) || a === 'draftActivate' || a === 'draftEdit')
        if (!entity && act && actions.has(act)) entity = actions.get(act)
        if (!entity) continue
        out.push({ file: t.props.file, line: i + 1, method: m[1], entity, op: act || VERB[m[1]], users: t.props.runsAs || [] })
      }
    })
  }
  return out
}

function requestMatches(cls, reqs) {
  const d = cls.dim; if (!d) return []
  return reqs.filter(r => r.entity === d.entity && (r.op === d.op || (SAME[r.op] || []).includes(d.op)) && (!d.users || r.users.some(u => d.users.includes(u))))
}

// static part, stored in atlas-data.json so CI can add test results without the graph
function classesFrom(td, g, root) {
  const reqs = scanRequests(g, root)
  return td.categories.flatMap(c => c.classes.map(x => {
    const rm = requestMatches(x, reqs)
    return { id: x.id, cat: c.n, name: x.name, entity: x.dim?.entity || '?', op: x.dim?.op || '?', state: x.dim?.state ?? null, users: x.dim?.users || null, req: !!x.req,
      exact: !x.dim?.state && !/:f$/.test(x.id) && !x.id.startsWith('CMB:') && !x.id.startsWith('FW:'),
      request: rm.slice(0, 3).map(r => `${r.file}:${r.line}`), name_match: x.covered_by || null, fact: x.fact || null }
  }))
}

// requests recorded while the app's own tests ran (addon measured), in the shape requestMatches expects;
// our own generated tests and probes are counted through the manifest, not here
// CAP's draft events, in the vocabulary of the classes (the same ops the text scan gives a request)
const DRAFT_OP = { NEW: 'CREATE', PATCH: 'UPDATE', SAVE: 'draftActivate', EDIT: 'draftEdit', DISCARD: 'DELETE', CANCEL: 'DELETE' }
function measuredRequests(log = []) {
  return log.filter(r => r.file && !/^test[\\/](generated|discovery-)/.test(r.file) && r.entity)
    .map(r => ({ file: r.file, test: r.test, entity: r.entity, op: DRAFT_OP[r.event] || r.event, users: r.user ? [r.user] : [], status: r.status }))
}

// results: { generated: jest json, baseline: jest json, requests: recorder log } (any may be null)
function classify(classes, manifest, results = {}) {
  const measured = results.requests ? measuredRequests(results.requests) : null
  const byFull = new Map()
  for (const s of results.generated?.testResults || []) for (const a of s.assertionResults) byFull.set(a.fullName, a.status)
  const baseFail = new Set((results.baseline?.testResults || []).filter(s => s.status === 'failed').map(s => s.name))
  const fileOk = f => ![...baseFail].some(n => n.endsWith(f))
  const tests = {}
  for (const t of manifest?.tests || []) (tests[t.cls] ||= []).push({ ...t, status: byFull.get(t.full) || null })
  const ran = !!results.generated
  for (const c of classes) {
    const ts = tests[c.id] || []
    const today = ts.filter(t => t.kind === 'today'), spec = ts.filter(t => t.kind === 'spec')
    c.tests = ts.map(t => ({ title: t.title, file: t.file, kind: t.kind, status: t.status || (ran ? 'missing' : 'not run') }))
    const hits = measured ? requestMatches({ dim: { entity: c.entity, op: c.op, users: c.users } }, measured) : null
    if (hits) c.measured = hits.length ? { n: hits.length, tests: [...new Set(hits.map(h => h.test || h.file))].slice(0, 3) } : null
    // with a measured run, the text scan is replaced by what the tests really sent
    const reqOk = hits ? hits.map(h => h.file) : c.request.filter(r => fileOk(r.split(':')[0]))
    if (today.some(t => t.status === 'failed')) c.st = 'fail'
    else if (today.length && today.every(t => t.status === 'passed')) c.st = spec.length ? 'spec' : 'tested'
    else if (reqOk.length && c.exact) c.st = 'tested'
    else if (today.length || c.req) c.st = 'gen'
    else if (reqOk.length || c.name_match) c.st = 'likely'
    else c.st = 'none'
  }
  return classes
}

// ranks untested classes: risky operations first, then the categories that guard data
const CW = { Authorization: 5, 'UI vs server rules': 4, 'Status transitions': 4, 'Handler rules': 3, 'Draft lifecycle': 2, 'Framework constraints': 1 }
function summarize(classes, risks = [], ran = false) {
  const counts = Object.fromEntries(STATUS.map(s => [s, classes.filter(c => c.st === s).length]))
  const riskHits = c => risks.filter(r => [c.op, c.entity].some(w => w && w.length > 3 && (r.t + ' ' + r.d).includes(w))).reduce((a, r) => a + r.i * r.l, 0)
  const next = classes.filter(c => c.st === 'none' || c.st === 'likely').map(c => ({ id: c.id, name: c.name, cat: c.cat, st: c.st, score: (CW[c.cat] ?? 1) * 3 + Math.min(30, riskHits(c)) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 15)
  const cats = [...new Set(classes.map(c => c.cat))].map(n => ({ n, ...Object.fromEntries(STATUS.map(s => [s, classes.filter(c => c.cat === n && c.st === s).length])) }))
  // heatmap: rows entity · operation, columns state (· = not state-specific)
  const rowKey = c => `${c.entity} · ${c.op}`
  const rows = [...new Set(classes.map(rowKey))].sort()
  const cols = [...new Set(classes.map(c => c.state ?? 'any'))].sort((a, b) => (a === 'any') - (b === 'any') || a.length - b.length || a.localeCompare(b))
  const cells = rows.map(r => cols.map(s => classes.filter(c => rowKey(c) === r && (c.state ?? 'any') === s).map(c => c.id)))
  const tested = counts.tested
  return { ran, counts, total: classes.length, tested, pct: classes.length ? Math.round(tested / classes.length * 100) : 0, cats, next, heat: { rows, cols, cells }, label: LABEL }
}

module.exports = { measuredRequests, scanRequests, classesFrom, classify, summarize, STATUS, LABEL }
