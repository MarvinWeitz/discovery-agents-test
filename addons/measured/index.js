// Addon "measured": facts the running app gives in CI, next to what the pipeline predicts from the code.
//   authorization   authz-probe.test.js sends one request per row of the static matrix and user; CAP's
//                   own auth handlers answer (plan.json written here, results run/measured/authz.json)
//   requests        recorder.js logs every request the tests send (user, entity, event, outcome, the
//                   test, the database queries it caused): generated tests, the app's own tests, the probe
//   rules reached   Jest's coverage (V8, istanbul JSON) of the app's own tests and the generated ones:
//                   which handler rules (file:line) any test executes
// The coverage addon reads the request log too (classes exercised by a measured request).
// Off: "measured": false in discovery.config.json. Remove: delete addons/measured.
// Walkthrough: docs/walkthrough/11-atlas-and-addons.md · Sources: docs/walkthrough/references.md (Runtime)
const fs = require('fs')
const path = require('path')
const { matrix, short } = require('../../lib/analyse/authz')
const { loadSeed } = require('../../lib/analyse/seed-data')
const { readRequests, readCoverage } = require('./read')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }

// OData V4 key predicate of a seed row: (1) or (ID=1,IsActiveEntity=true); strings quoted, numbers and UUIDs bare
function keyOf(csn, name, row, draft) {
  const def = csn.definitions[name]
  const keys = Object.entries(def?.elements || {}).filter(([k, e]) => e.key && k !== 'IsActiveEntity' && !e.target)
  if (!row || !keys.length) return null
  const lit = ([k, e]) => { const v = row[k] ?? row[k.toUpperCase()]; if (v === undefined || v === '') return null; return /^cds\.(U?Int|Integer|Decimal|Double|UUID)/.test(e.type) || /Int/.test(e.type || '') ? v : `'${String(v).replace(/'/g, "''")}'` }
  const parts = keys.map(k => [k[0], lit(k)])
  if (parts.some(p => p[1] === null)) return null
  if (!draft && parts.length === 1) return `(${parts[0][1]})`
  return `(${[...parts.map(([k, v]) => `${k}=${v}`), ...(draft ? ['IsActiveEntity=true'] : [])].join(',')})`
}

// one request per row of the static matrix (the cell values are compared per row and user)
function plan(g, csn, root, metrics) {
  const auth = matrix(g, { restrictAll: metrics?.auth?.restrictAll })
  const seed = loadSeed(root)
  const requests = []
  auth.rows.forEach((r, row) => {
    if (!r.entity) return
    const n = g.nodes.get(`svcentity:${r.entity}`); if (!n) return
    const svc = g.byType('Service').find(s => s.props.name === n.props.service); if (!svc?.props.path) return
    const set = `${svc.props.path}/${short(n.id)}`
    const rows = seed[n.props.projectsOn || r.entity]?.rows || seed[r.entity]?.rows || []
    const key = keyOf(csn, r.entity, rows[0], n.props.draft)
    const t = r.token
    if (t === 'READ') requests.push({ row, op: r.op, method: 'GET', url: `${set}?$top=1` })
    else if (t === 'CREATE') requests.push({ row, op: r.op, method: 'POST', url: set, body: {} })
    else if (t === 'UPDATE' && key) requests.push({ row, op: r.op, method: 'PATCH', url: `${set}${key}`, body: {} })
    else if (t === 'DELETE' && key) requests.push({ row, op: r.op, method: 'DELETE', url: `${set}${key}` })
    else if (key && csn.definitions[r.entity]?.actions?.[t]) requests.push({ row, op: r.op, method: 'POST', url: `${set}${key}/${n.props.service}.${t}`, body: {} })
  })
  return { users: auth.users.map(u => u.id), requests }
}

function facts(D, { g, csn, root, metrics, runDir }) {
  const dir = path.join(runDir, 'measured')
  fs.mkdirSync(dir, { recursive: true })
  const p = plan(g, csn, root, metrics)
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(p, null, 1))
  D.MEASURED = { planned: p.requests.length * p.users.length, ran: false }
}

// static cell (y allowed, n denied, r open, a unclear) vs what CAP answered
function compareAuthz(D, measured) {
  const rows = []
  let agree = 0, differ = 0, unclear = 0
  for (const m of measured.results) {
    const s = D.AUTH?.[m.row]; if (!s) continue
    const cells = m.cells.map((c, i) => {
      const sv = typeof s.c[i] === 'object' ? s.c[i].v : s.c[i]
      const allowed = c.v === 'y', denied = c.v === 'n' || c.v === 'n405'
      const st = sv === 'a' || c.v === 'error' ? 'measured' : ((sv === 'y' || sv === 'r') && allowed) || (sv === 'n' && denied) ? 'agree' : 'differ'
      st === 'agree' ? agree++ : st === 'differ' ? differ++ : unclear++
      return { user: c.user, static: sv, measured: c.v, status: c.status, st }
    })
    rows.push({ row: m.row, svc: s.svc, op: m.op, method: m.method, url: m.url, cells })
  }
  return { users: measured.users, rows, agree, differ, unclear }
}

// handler rules (graph Rule nodes, file:line) that a test executed
function rulesReached(nodes, cov) {
  const rules = nodes.filter(n => n.type === 'Rule' && n.evidence)
  const out = rules.map(r => { const [f, l] = r.evidence.split(':'); const lines = cov.get(f); return { id: r.id, ev: r.evidence, kind: r.props.kind, guard: r.props.guard || r.props.field || '', reached: lines ? lines.has(Number(l)) : null } })
  const known = out.filter(r => r.reached !== null)
  return { total: rules.length, measured: known.length, reached: known.filter(r => r.reached).length, never: known.filter(r => !r.reached), files: cov.size }
}

function summarizeRequests(reqs) {
  const by = new Map()
  for (const r of reqs) {
    const k = `${r.entity || r.service} · ${r.event}`
    const x = by.get(k) || { entity: r.entity, event: r.event, n: 0, users: new Set(), tests: new Set(), outcomes: {} }
    x.n++; x.users.add(r.user || '?'); if (r.file) x.tests.add(r.file); x.outcomes[r.status ?? '?'] = (x.outcomes[r.status ?? '?'] || 0) + 1
    by.set(k, x)
  }
  const rows = [...by.values()].map(x => ({ ...x, users: [...x.users].sort(), tests: [...x.tests].sort() })).sort((a, b) => b.n - a.n)
  return { total: reqs.length, files: [...new Set(reqs.map(r => r.file).filter(Boolean))].length, users: [...new Set(reqs.map(r => r.user).filter(Boolean))].sort(), rows }
}

function apply(D) {
  const M = D.MEASURED
  const parts = []
  if (M.authz) parts.push(`Authorization: CAP answered <b>${M.authz.rows.length * M.authz.users.length}</b> requests; ${M.authz.agree} cells agree with the static matrix${M.authz.differ ? `, <b>${M.authz.differ} differ</b>` : ''}${M.authz.unclear ? `, ${M.authz.unclear} settle an unclear cell` : ''}.`)
  if (M.requests) parts.push(`Tests sent <b>${M.requests.total}</b> requests from ${M.requests.files} test files as ${M.requests.users.length} users.`)
  if (M.rules) parts.push(`Rules reached by any test: <b>${M.rules.reached} of ${M.rules.measured}</b>${M.rules.never.length ? ` (${M.rules.never.length} never run)` : ''}.`)
  if (!parts.length) return
  const sec = { code: 'MSR', name: 'Measured in CI', take: parts.join(' '), views: [{ k: 'A', label: 'Authorization, measured' }, { k: 'B', label: 'Requests the tests send' }, { k: 'C', label: 'Rules reached' }] }
  const i = D.SECTIONS.findIndex(s => s.code === 'MSR')
  if (i >= 0) D.SECTIONS[i] = sec; else D.SECTIONS.push(sec)
  D.META.sources = { ...D.META.sources, MSR: 'running app in CI (cds.test, Jest coverage)' }
  if (M.authz) D.KPIS = D.KPIS.filter(k => k[1] !== 'auth cells measured differ').concat([[String(M.authz.differ), 'auth cells measured differ', M.authz.differ ? 'w' : '']])
}

function afterTests({ out }) {
  const file = path.join(out, 'atlas-data.json')
  const D = readJson(file); if (!D) return false
  const dir = path.join(out, 'run', 'measured')
  const authz = readJson(path.join(dir, 'authz.json'))
  const reqs = readRequests(dir)
  const cov = readCoverage(dir)
  if (!authz && !reqs.length && !cov.size) return false
  D.MEASURED = { ...(D.MEASURED || {}), ran: true }
  if (authz) D.MEASURED.authz = compareAuthz(D, authz)
  if (reqs.length) D.MEASURED.requests = summarizeRequests(reqs)
  if (cov.size) D.MEASURED.rules = rulesReached(readJsonl(path.join(out, 'run', 'graph', 'nodes.jsonl')), cov)
  apply(D)
  fs.writeFileSync(file, JSON.stringify(D, null, 1))
  fs.mkdirSync(path.join(out, 'pr'), { recursive: true })
  fs.writeFileSync(path.join(out, 'pr', 'measured.md'), summaryMd(D.MEASURED))
  return true
}


// findings stage (after the tests ran): the measured authorization per operation, settling the static
// matrix's unclear cells, and handler rules no test executes
function findings(B, { D }) {
  const { gapId, findingId } = require('../../lib/findings/book')
  const M = D?.MEASURED
  const statics = new Map((D?.AUTH || []).map(r => [r.op, r]))
  for (const r of M?.authz?.rows || []) {
    // the same operation text appears once per service (Customers READ in two services): match by row, then service
    const s = (r.row != null && D.AUTH?.[r.row]) || (D?.AUTH || []).find(x => x.op === r.op && (!r.svc || x.svc === r.svc)) || statics.get(r.op)
    const key = `${r.svc || s?.svc || ''}|${r.op}`
    const differ = r.cells.filter(c => c.st === 'differ'), settled = r.cells.filter(c => c.st === 'measured')
    // only a row the static matrix left unclear has a gap to settle (lib/findings/static.js authz)
    const hasGap = r.cells.some(c => c.static === 'a')
    B.finding({ kind: 'authz-measured', key, method: 'measured', source: 'addons/measured (authz-probe.test.js)', status: differ.length ? 'refuted' : 'confirmed',
      title: `${r.method} ${r.url}: ${differ.length ? `${differ.length} cells differ from the static matrix` : 'as predicted'}`,
      statement: r.cells.map(c => `${c.user} ${c.status ?? c.measured}`).join(', ') + '.', severity: { level: differ.length ? 'warning' : 'good' }, evidence: s?.ev ? [s.ev] : [],
      about: [findingId('authz', key)], resolves: hasGap && (settled.length || differ.length) ? [gapId('authz-unclear', key)] : [],
      data: { op: r.op, method: r.method, url: r.url, cells: r.cells } })
  }
  for (const r of M?.rules?.never || []) {
    B.finding({ kind: 'rule-reached', key: r.id, method: 'measured', source: 'addons/measured (Jest V8 coverage)', title: `No test runs the ${r.kind} at ${r.ev}`,
      statement: `No generated test and no test of the app executes this line${r.guard ? ` (${r.guard})` : ''}.`, severity: { level: 'warning' }, evidence: [r.ev], subjects: [r.id] })
  }
}

const cell = s => String(s ?? '').replace(/\|/g, '\\|')
const MARK = { agree: '✅', differ: '❗', measured: '◽' }
function authzMd(A) {
  return [`| Operation | ${A.users.map(cell).join(' | ')} |`, `| --- | ${A.users.map(() => '---').join(' | ')} |`,
    ...A.rows.map(r => `| ${cell(r.op)} | ${r.cells.map(c => `${MARK[c.st]} ${c.static}→${c.measured} (${c.status ?? '–'})`).join(' | ')} |`)].join('\n')
}
function summaryMd(M) {
  return ['### Measured in CI', '',
    ...(M.authz ? [`**Authorization:** ${M.authz.agree} cells agree with the static matrix, ${M.authz.differ} differ, ${M.authz.unclear} were unclear and are now measured.`, '',
      ...(M.authz.differ ? ['<details><summary>Cells that differ</summary>', '', '| Operation | User | Static | CAP answered |', '| --- | --- | --- | --- |',
        ...M.authz.rows.flatMap(r => r.cells.filter(c => c.st === 'differ').map(c => `| ${cell(r.op)} | ${c.user} | ${c.static} | ${c.measured} (${c.status}) |`)), '', '</details>', ''] : [])] : []),
    ...(M.requests ? [`**Requests from tests:** ${M.requests.total} from ${M.requests.files} files as ${M.requests.users.join(', ') || 'no user'}.`, ''] : []),
    ...(M.rules ? [`**Rules reached:** ${M.rules.reached} of ${M.rules.measured} handler rules ran in some test.`, '',
      ...(M.rules.never.length ? ['<details><summary>Rules no test runs</summary>', '', ...M.rules.never.slice(0, 20).map(r => `- \`${r.ev}\` ${r.kind}: ${cell(r.guard)}`), '', '</details>', ''] : [])] : [])].join('\n')
}

const topics = {
  MSR: D => {
    const M = D.MEASURED || {}
    return ['What the running app answered in CI, next to what the pipeline read from the code.', '',
      '### Authorization, measured', '', M.authz ? ['Each cell: static value → what CAP answered (HTTP status). y allowed, n denied (401/403), n405 not allowed by Capabilities, r open, a unclear. ✅ agree · ❗ differ · ◽ measured where the static matrix was unclear.', '', authzMd(M.authz)].join('\n') : '_Not measured in this run._', '',
      '### Requests the tests send', '', M.requests ? ['| Entity · event | Requests | Users | Status codes | Test files |', '| --- | --- | --- | --- | --- |',
        ...M.requests.rows.slice(0, 40).map(r => `| ${cell(`${r.entity || ''} · ${r.event}`)} | ${r.n} | ${r.users.join(', ')} | ${Object.entries(r.outcomes).map(([k, v]) => `${k}×${v}`).join(' ')} | ${r.tests.slice(0, 3).map(t => `\`${t}\``).join(', ')} |`)].join('\n') : '_Not measured in this run._', '',
      '### Rules reached', '', M.rules ? [`${M.rules.reached} of ${M.rules.measured} handler rules ran in at least one test (Jest coverage, V8).`, '', ...M.rules.never.map(r => `- never run: \`${r.ev}\` ${r.kind} ${cell(r.guard)}`)].join('\n') : '_Not measured in this run._', ''].join('\n')
  },
}

module.exports = { facts, afterTests, findings, topics, views: path.join(__dirname, 'view.js'), plan, keyOf, compareAuthz, rulesReached, summarizeRequests }
