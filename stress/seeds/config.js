// Configuration variants on the orders base: where CAP reads its settings from (package.json, .cdsrc.json,
// .cdsrc.yaml, profiles), folder layout (cds.folders, monorepo), deployment descriptors (xs-security.json,
// multitenancy, ui5.yaml paths) and settings that are bugs in production (dummy or mocked auth).
const O2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const act = (id, a) => `/orders/Orders(ID=${id},IsActiveEntity=true)/OrderService.${a}`
const ACT = ['submit', 'approve', 'reject']
const bound = ACT.map(a => ({ rel: 'handles', to: `^action:OrderService\\.Orders\\.${a}$` }))
const USERS = ['alice', 'bob', 'carol', 'admin'].map(u => ({ type: 'MockUser', id: `^user:${u}$` }))
const noFalseMissing = [{ check: 'action-without-handler' }, { check: 'risk:noimpl' }]
const SAME = `test('carol approves a submitted order, alice may not', async () => {
  assert.strictEqual((await POST('${act(O2, 'approve')}', {}, as('alice'))).status, 403)
  assert.strictEqual((await POST('${act(O2, 'approve')}', {}, as('carol'))).status, 200)
})`
const users = j => j.cds.requires.auth

exports.base = 'orders'
exports.group = 'config'
exports.seeds = [
  {
    id: 'config-cdsrc-json', category: 'config', title: 'cds config in .cdsrc.json instead of package.json',
    bug: 'No bug: the same mocked users, read from .cdsrc.json.',
    edits: [
      { file: '.cdsrc.json', write: JSON.stringify({ requires: { '[production]': { auth: 'xsuaa' }, auth: { kind: 'mocked', users: { alice: { password: '', roles: ['Buyer'] }, bob: { password: '', roles: ['Buyer'] }, carol: { password: '', roles: ['Approver'] }, admin: { password: '', roles: ['Admin'] } } } } }, null, 2) + '\n' },
      { file: 'package.json', json: j => { delete j.cds } },
    ],
    graph: [...USERS, ...bound], forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'config-cdsrc-yaml', category: 'config', title: 'cds config in .cdsrc.yaml',
    bug: 'No bug: the mocked users come from .cdsrc.yaml.',
    edits: [
      { file: '.cdsrc.yaml', write: 'requires:\n  "[production]":\n    auth: xsuaa\n  auth:\n    kind: mocked\n    users:\n      alice: { password: "", roles: [Buyer] }\n      bob: { password: "", roles: [Buyer] }\n      carol: { password: "", roles: [Approver] }\n      admin: { password: "", roles: [Admin] }\n' },
      { file: 'package.json', json: j => { delete j.cds } },
    ],
    graph: [...USERS, ...bound], forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'config-profile-users', category: 'config', title: 'Mocked users only in the [development] profile, xsuaa in [production]',
    bug: 'No bug: the usual split between local mock users and XSUAA in production.',
    edits: [{ file: 'package.json', json: j => { j.cds.requires = { '[development]': { auth: users(j) }, '[production]': { auth: 'xsuaa' } } } }],
    graph: USERS, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'config-custom-folders', category: 'config', title: 'cds.folders.srv = "service" and srv/ renamed',
    bug: 'No bug: services and handlers live in service/ as configured.',
    edits: [
      { move: ['srv', 'service'] },
      { file: 'package.json', json: j => { j.cds.folders = { srv: 'service' } } },
      { file: 'app/orders/annotations.cds', find: "'../../srv/order-service'", replace: "'../../service/order-service'" },
    ],
    graph: bound, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'config-monorepo', category: 'config', title: 'Monorepo: CAP app in packages/backend, discovery pointed at the repo root',
    bug: 'No bug: npm workspaces; the CAP project is one level down.',
    edits: [
      { move: ['db', 'packages/backend/db'] }, { move: ['srv', 'packages/backend/srv'] }, { move: ['app', 'packages/backend/app'] },
      { move: ['test', 'packages/backend/test'] }, { move: ['package.json', 'packages/backend/package.json'] },
      { file: 'package.json', write: JSON.stringify({ name: 'stress-monorepo', private: true, workspaces: ['packages/*'] }, null, 2) + '\n' },
    ],
    proofDir: 'packages/backend', detect: true,
    graph: [...bound, { type: 'Service', id: '^service:OrderService$' }], forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'config-dummy-auth-production', category: 'config', title: '[production] requires auth: "dummy"',
    bug: 'Dummy auth in production: every request runs as a privileged user, all @requires and @restrict are void.',
    edits: [{ file: 'package.json', json: j => { j.cds.requires['[production]'] = { auth: 'dummy' } } }],
    expect: [{ check: 'rule:auth-not-for-production', text: 'dummy' }],
  },
  {
    id: 'config-mocked-auth-production', category: 'config', title: '[production] keeps mocked auth with fixed users',
    bug: 'Mocked auth in production: anyone who knows the user name "admin" (password empty) is admin.',
    edits: [{ file: 'package.json', json: j => { j.cds.requires['[production]'] = { auth: { kind: 'mocked' } } } }],
    expect: [{ check: 'rule:auth-not-for-production', text: 'mocked' }],
  },
  {
    id: 'config-mocked-auth-no-production-override', category: 'config', title: 'Mocked users at top level, no [production] auth',
    bug: 'The mock users sit at the top level of cds.requires.auth and nothing overrides them for production, so production stays mocked (as many samples are configured).',
    edits: [{ file: 'package.json', json: j => { delete j.cds.requires['[production]'] } }],
    expect: [{ check: 'rule:auth-not-for-production', text: 'mocked' }],
  },
  {
    id: 'config-xs-security-missing-scope', category: 'config', title: 'xs-security.json lacks the Admin scope',
    bug: '@requires: Admin, but xs-security.json defines only Buyer and Approver: nobody can be given Admin in production.',
    edits: [{ file: 'xs-security.json', write: JSON.stringify({ xsappname: 'stress-orders', 'tenant-mode': 'dedicated',
      scopes: [{ name: '$XSAPPNAME.Buyer' }, { name: '$XSAPPNAME.Approver' }],
      'role-templates': [{ name: 'Buyer', 'scope-references': ['$XSAPPNAME.Buyer'] }, { name: 'Approver', 'scope-references': ['$XSAPPNAME.Approver'] }] }, null, 2) + '\n' }],
    expect: [{ check: 'rule:unknown-role', text: 'Admin' }],
  },
  {
    id: 'config-xs-security-complete', category: 'config', title: 'xs-security.json with every role',
    bug: 'No bug: scopes and role templates for Buyer, Approver and Admin.',
    edits: [{ file: 'xs-security.json', write: JSON.stringify({ xsappname: 'stress-orders', 'tenant-mode': 'dedicated',
      scopes: ['Buyer', 'Approver', 'Admin'].map(r => ({ name: `$XSAPPNAME.${r}` })),
      'role-templates': ['Buyer', 'Approver', 'Admin'].map(r => ({ name: r, 'scope-references': [`$XSAPPNAME.${r}`] })) }, null, 2) + '\n' }],
    forbid: [{ check: 'rule:unknown-role' }],
  },
  {
    id: 'config-multitenancy', category: 'config', title: 'Multitenancy, extensibility and feature toggles with an MTX sidecar',
    bug: 'No bug: an MTX sidecar folder and cds.requires.multitenancy / extensibility / toggles.',
    edits: [
      { file: 'package.json', json: j => { j.cds.requires['[production]'] = { auth: 'xsuaa', multitenancy: true, extensibility: true, toggles: true } } },
      { file: 'mtx/sidecar/package.json', write: JSON.stringify({ name: 'stress-orders-mtx', private: true, dependencies: { '@sap/cds': '^9', '@sap/cds-mtxs': '^3' }, cds: { profile: 'mtx-sidecar' } }, null, 2) + '\n' },
    ],
    graph: bound, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'config-ui5-custom-webapp-path', category: 'config', title: 'ui5.yaml maps webapp to src/',
    bug: 'No bug: the UI5 app sources are in app/orders/src as ui5.yaml says.',
    edits: [
      { move: ['app/orders/webapp', 'app/orders/src'] },
      { file: 'app/orders/ui5.yaml', append: 'resources:\n  configuration:\n    paths:\n      webapp: src\n' },
    ],
    graph: [{ type: 'UI5App', id: 'stress\\.orders' }],
  },
  {
    id: 'config-remote-profile', category: 'config', title: 'Remote API configured only for [production], called from submit',
    bug: 'The remote API is configured only in the production profile; locally and in tests the call has no destination and no mock.',
    edits: [
      { file: 'srv/external/API_BP.cds', write: "@cds.external: true\nservice API_BP {\n  entity Partners { key ID : String(10); name : String; blocked : Boolean; }\n}\n" },
      { file: 'package.json', json: j => { j.cds.requires['[production]'] = { auth: 'xsuaa', API_BP: { kind: 'odata', model: 'srv/external/API_BP', credentials: { destination: 'BP' } } } } },
      { file: 'srv/order-service.js', find: "      await UPDATE(Orders, ID).with({ status_code: 'S' })", replace: "      const bp = await cds.connect.to('API_BP')\n      const partner = await bp.run(SELECT.one.from('API_BP.Partners').where({ ID: '1000' }))\n      if (partner?.blocked) return req.reject(409, 'Customer is blocked')\n      await UPDATE(Orders, ID).with({ status_code: 'S' })" },
    ],
    expect: [{ check: 'risk:remote-untested', text: 'API_BP' }],
  },
]
