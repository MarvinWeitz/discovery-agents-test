// Rule-based risks: each detector turns a graph finding into a scored risk with evidence and the
// test that would catch it. Impact (i) and likelihood (l) are fixed per detector, 1..5, so scores
// are comparable between apps. Agents add risks the rules cannot see (see atlas-facts --base).
const { matrix, piiFields, short } = require('./authz')

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
  for (const a of g.byType('Action').filter(a => !g.in(a.id, 'handles').length)) add({ key: `noimpl:${a.props.name}`, t: `${a.props.name} declared and granted, no handler`, i: 2, l: 3, lay: 'Service', ev: a.evidence,
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
  out.sort((a, b) => b.i * b.l - a.i * a.l || a.key.localeCompare(b.key))
  out.forEach((r, k) => { r.id = 'G' + (k + 1) })
  return out
}

module.exports = { detectRisks }
