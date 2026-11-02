// Rule-based risks: each detector turns a graph finding into a scored risk with evidence and the
// test that would catch it. Impact (i) and likelihood (l) are fixed per detector, 1..5, so scores
// are comparable between apps. Agents add risks the rules cannot see (see atlas-facts --base).
// Step 9 · Walkthrough: docs/walkthrough/09-patterns-risks-rules.md
const fs = require('fs')
const path = require('path')
const { matrix, piiFields, short } = require('./authz')

// Text of the app's existing tests, to tell whether a remote system or an event is exercised anywhere
function testText(g, root) {
  if (!root) return ''
  return g.byType('ExistingTest').map(t => { try { return fs.readFileSync(path.join(root, t.props.file), 'utf8') } catch { return '' } }).join('\n')
}

function detectRisks(g, meta = {}) {
  const out = []
  const add = r => out.push({ src: 'rule', ...r })
  const auth = matrix(g, meta)
  const svcPath = name => g.byType('Service').find(s => name.startsWith(s.props.name + '.'))?.props.path

  // personal data readable without the expected role
  const openPii = {}
  for (const r of auth.rows.filter(r => r.pii && r.c.some(c => c.v === 'r'))) (openPii[r.entity.split('.').pop()] ||= []).push(r)
  for (const [ent, rows] of Object.entries(openPii)) {
    const n = g.nodes.get(`svcentity:${rows[0].entity}`), anon = rows.some(r => r.c[0].v === 'r')
    add({ key: `pii-open:${ent}`, t: `${ent} personal data open to any caller`, i: 4, l: anon ? 4 : 3, lay: 'Model', ev: n?.evidence || rows[0].ev,
      d: `${rows.map(r => svcPath(r.entity) + '/' + ent).join(' and ')} return ${piiFields(n).slice(0, 5).join(', ')} without a role check${anon ? '; with no service-level @requires this may include unauthenticated calls (verify behind the approuter)' : ''}.`,
      test: `GET ${rows.map(r => svcPath(r.entity) + '/' + ent).join(', ')} as anonymous and as a user without roles, expect 401/403.` })
  }
  // UI promises the server does not keep
  const ui = g.byType('UiRule')
  const opOnly = ui.filter(r => r.props.kind === 'operation-available' && r.props.verdict === 'ui-only')
  if (opOnly.length) add({ key: 'ui-only:actions', t: `${opOnly.map(r => r.props.action).join(', ')} callable in states the UI hides`, i: 3, l: 4, lay: 'Node', ev: opOnly[0].evidence,
    d: `@Core.OperationAvailable hides ${opOnly.map(r => `${r.props.action} when ${r.props.ui.replace(/^.*?(\w+)\s*(!=|=)/, '$1 $2')}`).join('; ')}, but no handler checks the status, so a direct POST still changes it.`,
    test: `POST each action on an instance in the hidden state, expect 4xx.` })
  const fcOnly = ui.filter(r => ['field-control', 'CreateHidden', 'DeleteHidden'].includes(r.props.kind) && r.props.verdict === 'ui-only')
  if (fcOnly.length) add({ key: 'ui-only:fields', t: `Read-only and hidden-create rules exist only in the UI (${fcOnly.length})`, i: 3, l: 3, lay: 'UI', ev: fcOnly[0].evidence,
    d: `${fcOnly.map(r => `${short(r.props.entity)}: ${r.props.ui}`).join('; ')}. OData clients can still PATCH, POST or DELETE.`,
    test: `PATCH a locked field and POST/DELETE a child on a non-open instance, expect 4xx.` })
  for (const r of ui.filter(r => r.props.verdict === 'partial')) add({ key: `partial:${r.id}`, t: `${r.props.action || short(r.props.entity)} enforced only partly`, i: 3, l: 3, lay: 'Node', ev: r.evidence,
    d: `UI: ${r.props.ui}. Server: ${r.props.server}. The server lets ${(r.props.srvAllowed || []).filter(v => !(r.props.uiAllowed || []).includes(v)).join(', ') || 'some states'} through.`,
    test: `Call ${r.props.action || 'it'} in the states the UI hides, expect 4xx.` })
  // actions granted without implementation
  const remoteSvc = new Set(g.byType('Service').filter(s => s.props.remote).map(s => s.props.name))
  for (const a of g.byType('Action').filter(a => !g.in(a.id, 'handles').length && ![...remoteSvc].some(s => a.props.name.startsWith(s + '.')))) add({ key: `noimpl:${a.props.name}`, t: `${a.props.name} declared and granted, no handler`, i: 2, l: 3, lay: 'Service', ev: a.evidence,
    d: `The action is in the service and reachable through OData, but no Node handler implements it; CAP answers with an error at runtime.`, test: `POST ${a.props.name} as an authorised user, expect a defined error or remove the action.` })
  // services with no guard at all
  for (const s of g.byType('Service').filter(s => !g.out(s.id, 'requires').length && !g.out(s.id, 'exposes').some(e => g.out(e.to, 'requires').length)))
    add({ key: `open-svc:${short(s.id)}`, t: `${short(s.id)} has no @requires or @restrict`, i: 3, l: meta.restrictAll ? 1 : 3, lay: 'Service', ev: s.evidence,
      d: `Every entity under ${s.props.path} is readable by any caller${meta.restrictAll ? '; restrict_all_services is on, so CAP still requires a login' : ' (CAP default restrict_all_services: false)'}.`, test: `GET ${s.props.path}/$metadata and one entity set as anonymous.` })
  // row-level filters: the classic place where one user sees another user's data
  for (const e of g.edges.filter(e => e.rel === 'requires' && e.props.where)) add({ key: `row-level:${short(e.from)}`, t: `${short(e.from)}: row-level filter for ${short(e.to)} needs a cross-user test`, i: 4, l: 2, lay: 'Service', ev: e.evidence,
    d: `@restrict grants ${e.props.grant} to ${short(e.to)} only where ${e.props.where}. A wrong or missing filter (or a grant without it on the same role) lets one user read or change another user's rows.`,
    test: `As user A create a row, then READ and PATCH it as user B with the same role, expect 403/404.` })
  // CDS layering violations
  const bad = g.edges.filter(e => ['annotates', 'extends', 'uses'].includes(e.rel) && e.props.verdict === 'bad')
  for (const b of bad.filter(e => String(e.props.target).startsWith('cds.'))) add({ key: `global:${b.props.target}`, t: `Global annotation on built-in ${b.props.target}`, i: 2, l: 3, lay: 'Model', ev: b.evidence,
    d: `${b.from.replace('cdsfile:', '')} ${b.props.why}: every element of that type in every service changes, including ones the author never saw.`, test: `Check $metadata of each service for the annotation on unrelated ${b.props.target} fields.` })
  const lay = bad.filter(e => !String(e.props.target).startsWith('cds.'))
  if (lay.length) add({ key: 'layering', t: `${lay.length} CDS files change models of another layer`, i: 2, l: 2, lay: 'Model', ev: lay[0].evidence,
    d: lay.map(e => `${e.from.replace('cdsfile:', '')}: ${e.props.why}`).join('; ') + '.', test: 'Architecture test on the CDS dependency graph (fails on new violations).' })
  // UI5 lint errors
  const errs = g.byType('Finding').filter(f => f.props.severity === 'error')
  if (errs.length) add({ key: 'ui5-errors', t: `${errs.length} UI5 lint errors`, i: 2, l: 2, lay: 'UI', ev: errs[0].evidence, d: [...new Set(errs.map(f => f.props.rule))].join(', ') + '. These break with the next UI5 major release.', test: 'Run @ui5/linter in CI and fail on errors.' })
  // test suite blind spots
  const runAs = new Set(g.edges.filter(e => e.rel === 'runs_as').map(e => e.to))
  const guarded = g.edges.filter(e => e.rel === 'requires').length
  if (guarded && runAs.size <= 1) add({ key: 'tests-one-user', t: runAs.size ? `Tests run as one user only (${short([...runAs][0])})` : 'No test sets a user', i: 3, l: 3, lay: 'Tests', ev: g.byType('ExistingTest').find(t => t.props.kind === 'service')?.evidence || g.byType('ExistingTest')[0]?.evidence || 'package.json:1',
    d: `${guarded} grants exist, but no existing test runs as a user who should be denied, so a broken @restrict would pass.`, test: 'Role × operation tests from the authorization matrix (generated).' })
  // rejections without explicit status default to 400 — fine; draft children inherit access
  const inh = auth.rows.filter(r => r.note && r.note.startsWith('inherits'))
  for (const r of inh) add({ key: `inherit:${r.entity}`, t: `${r.op.split(' (')[0]}: access inherited from the draft root`, i: 2, l: 2, lay: 'Service', ev: r.ev,
    d: 'Composition children carry no own @restrict. Access through the root is checked; direct requests to the child set need a test.', test: `PATCH a child as a user without write access on the root, expect 403.` })
  // ---- HANA-native objects: CAP creates nothing for them on SQLite, so the local test build cannot reach these paths ----
  const tests = testText(g, meta.root)
  const pathOf = id => { const n = g.nodes.get(id); return n ? `${svcPath(n.props.name) || ''}/${short(id)}` : short(id) }
  const nat = []
  for (const e of g.edges.filter(e => e.rel === 'backed_by')) {
    const a = g.nodes.get(e.to), via = g.in(e.from, 'projects_on').map(x => x.from).filter(x => x.startsWith('svcentity:'))
    nat.push({ ev: e.evidence, t: `${via.length ? via.map(pathOf).join(', ') : short(e.from)} reads ${a.props.kind.replace('hdb', '')} ${a.props.name}` })
  }
  for (const e of g.edges.filter(e => e.rel === 'uses_native')) {
    const a = g.nodes.get(e.to)
    if (!['hdbcalculationview', 'hdbview', 'hdbtable'].includes(a.props.kind)) nat.push({ ev: e.evidence, t: `${e.from.replace('file:', '')} uses ${a.props.kind.replace('hdb', '')} ${a.props.name}` })
  }
  if (nat.length) add({ key: 'hana-only', t: `${nat.length} code path${nat.length === 1 ? ' needs' : 's need'} HANA objects the SQLite tests do not have`, i: 3, l: 4, lay: 'Model', ev: nat[0].ev,
    d: nat.map(x => x.t).join('; ') + '. With @cds.persistence.exists or a native procedure/sequence, cds.test on SQLite fails with "no such table" or never reaches the call.',
    test: 'Run these requests once per build against an HDI container (cds bind + cds.test with the hybrid profile); on SQLite, stub db.run for the procedure and assert the error mapping.' })
  // native SQL that only HANA parses
  const sql = g.byType('SourceFile').flatMap(f => (f.props.nativeSql || []).filter(q => q.hanaOnly).map(q => ({ ev: `${f.props.path}:${q.line}`, f: f.props.path, q: q.sql })))
  if (sql.length) add({ key: 'native-sql', t: `${sql.length} native SQL statement${sql.length === 1 ? '' : 's'} only HANA understands`, i: 3, l: 3, lay: 'Node', ev: sql[0].ev,
    d: sql.map(x => `${x.ev}: ${x.q.slice(0, 70)}`).join('; ') + '. They bypass CQL (no draft, no @restrict, no localisation) and fail on SQLite.',
    test: 'Cover the calling handler with a HANA-profile test, or wrap the statement in a small module and unit-test both the call and its error handling.' })
  // code that switches on the database kind
  for (const f of g.byType('SourceFile').filter(f => f.props.dbBranches?.length)) {
    const b = f.props.dbBranches[0]
    add({ key: `db-branch:${f.props.path}`, t: `${f.props.path.split('/').pop()} branches on the database (${uniqCases(f.props.dbBranches).join(' / ')})`, i: 3, l: 4, lay: 'Node', ev: `${f.props.path}:${b.line}`,
      d: `switch on ${b.on}: tests on SQLite only ever run the sqlite branch, so the ${uniqCases(f.props.dbBranches).filter(c => c !== 'sqlite').join(' and ') || 'other'} branch ships untested.`,
      test: `Unit-test every branch with the kind injected (${uniqCases(f.props.dbBranches).join(', ')}) and a stubbed cds.run; add one HANA-profile run for the real statement.` })
  }
  // different models per database profile
  const variants = g.byType('DbVariant')
  if (variants.length > 1 && new Set(variants.map(v => v.props.model.join(','))).size > 1) add({ key: 'db-variant', t: `Production and tests load different database models (${variants.map(v => `${v.props.profile}: ${v.props.model.join(', ')}`).join(' · ')})`, i: 2, l: 3, lay: 'Model', ev: variants[0].evidence,
    d: `${variants.map(v => `[${v.props.profile}] loads ${v.props.files.join(', ') || v.props.model.join(', ')}`).join('; ')}. A calculated field or function that differs between them is only tested in the SQLite flavour.`,
    test: 'Compare the affected entity\'s results between profiles on the same seed data; keep at least one HANA-profile run in CI.' })

  // ---- remote systems and events: integration points that unit tests rarely reach ----
  const remotes = {}
  for (const e of g.edges.filter(e => ['calls_service', 'connects_to'].includes(e.rel) && e.to.startsWith('remote:'))) {
    const n = g.nodes.get(e.to); if (!n || /^cds\.xt\./.test(n.props.name)) continue
    const r = remotes[n.props.name] ||= { ev: e.evidence, from: new Set() }
    r.from.add(e.from.replace(/^(handler|file):/, '').replace(/:\d+$/, ''))
  }
  // exercised when a test names the system or loads the module that calls it (connectorS4HC.test.js)
  const untested = Object.entries(remotes).filter(([name, r]) => !tests.includes(name) && ![...r.from].some(f => new RegExp(`['"/]${path.basename(f).replace(/\.(js|ts)$/, '')}['"]`).test(tests)))
  if (untested.length) add({ key: 'remote-untested', t: `${untested.length} remote system${untested.length === 1 ? '' : 's'} called without a test double`, i: 3, l: 3, lay: 'Service', ev: untested[0][1].ev,
    d: untested.map(([name, r]) => `${name} from ${[...r.from].join(', ')}`).join('; ') + '. No existing test names them, so timeouts, 4xx answers and empty results are untested.',
    test: 'Mock each remote service in cds.test (cds.requires.<name>.kind = "odata" with a local mock impl, or stub srv.run) and test success, empty result and a 5xx answer.' })
  const subs = g.edges.filter(e => e.rel === 'subscribes')
  // exercised when a test emits the event; only naming the event, or an entity the subscriber writes, is not enough
  // (most tests read the main entities anyway: bookstore's tests name Books, which the OrderChanged subscriber updates)
  // (a test that asserts the emitter fires mentions the name too: stress corpus seed event-subscriber-untested)
  const evName = e => String(g.nodes.get(e.to)?.props.name || short(e.to)).split('.').pop()
  const emitted = n => new RegExp(`\\.(emit|send|publish|tx\\([^)]*\\)\\.emit)\\s*\\(\\s*['"\`]([\\w.]*\\.)?${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(tests)
  const silent = subs.filter(e => !emitted(evName(e)))
  if (silent.length) add({ key: 'events-untested', t: `${silent.length} event${silent.length === 1 ? ' from another service changes' : 's from other services change'} data here, untested`, i: 3, l: 3, lay: 'Node', ev: silent[0].evidence,
    d: silent.map(e => `${g.nodes.get(e.to)?.props.name} → ${g.out(e.from, 'writes').map(w => `${short(w.to)}${w.props.where ? ` where ${w.props.where}` : ''}`).join(', ') || 'handler'}`).join('; ') + '. A changed payload or a lost message silently leaves the data stale.',
    test: 'In cds.test, emit each event on the connected service (await srv.emit(event, payload)) and assert the write; add a payload that misses the where clause.' })

  out.sort((a, b) => b.i * b.l - a.i * a.l || a.key.localeCompare(b.key))
  out.forEach((r, k) => { r.id = 'G' + (k + 1) })
  return out
}

function uniqCases(bs) { return [...new Set(bs.flatMap(b => b.cases))] }

module.exports = { detectRisks }
