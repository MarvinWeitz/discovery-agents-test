// Seeds on the orders base (stress/apps/orders). Each seed plants one bug real CAP apps have, names the
// checks that must report it, and, where the bug is observable at runtime, a proof test: it passes on the
// seeded app and fails on the clean one, so the corpus shows the bug is real and not an artefact.
// Seed fields: id, category, title, bug, edits (lib/case.js), expect [{ check | gap, text, file }],
// also [checks that may fire as a correct side effect], forbid [matchers that must not fire],
// graph [{ rel, from, to } | { type, id }], proof (node:test body; GET/POST/PATCH/DELETE/as/assert in scope),
// detectable: false for bugs no static check can know (intent), kept to show the limit honestly.
const O1 = 'aaaaaaaa-0000-0000-0000-000000000001' // Open, alice
const O2 = 'aaaaaaaa-0000-0000-0000-000000000002' // Submitted, alice
const act = (id, a) => `/orders/Orders(ID=${id},IsActiveEntity=true)/OrderService.${a}`
const SVC = 'srv/order-service.cds', IMPL = 'srv/order-service.js', ANN = 'app/orders/annotations.cds'
const APPROVER_GRANT = "{ grant: ['READ', 'approve', 'reject'], to: 'Approver' }"
const APPROVE_GUARD = "if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be approved')"
const REJECT_HANDLER = `    this.on('reject', Orders, async req => {\n      const ID = req.params[0].ID ?? req.params[0]\n      const order = await SELECT.one.from(Orders, ID).columns('status_code')\n      if (!order) return req.reject(404, 'Order not found')\n      if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be rejected')\n      await UPDATE(Orders, ID).with({ status_code: 'R' })\n      return SELECT.one.from(Orders, ID)\n    })\n\n`
const BEFORE_RETURN = '    return super.init()'
const addHandler = code => ({ file: IMPL, find: BEFORE_RETURN, replace: `${code}\n\n${BEFORE_RETURN}` })

exports.base = 'orders'
exports.seeds = [
  // ---------------- authorization ----------------
  {
    id: 'authz-no-requires', category: 'authz', title: 'Admin service loses its @requires',
    bug: 'AdminService (customers with e-mail and phone) is open to anonymous callers.',
    edits: [{ file: 'srv/admin-service.cds', find: "@requires: 'Admin'\n", replace: '' }],
    expect: [{ check: 'risk:open-svc', text: 'AdminService' }, { check: 'risk:pii-open', text: 'Customers' }],
    also: ['authz'],
    proof: `test('anonymous reads customer e-mails', async () => { const r = await GET('/admin/Customers'); assert.strictEqual(r.status, 200); assert.ok(r.data.value[0].email) })`,
  },
  {
    id: 'authz-role-typo-requires', category: 'authz', title: "@requires names a role nobody has ('Admins')",
    bug: 'Typo in the role name locks every real admin out; no mock user, no xs-security role carries it.',
    edits: [{ file: 'srv/admin-service.cds', find: "@requires: 'Admin'", replace: "@requires: 'Admins'" }],
    expect: [{ check: 'rule:unknown-role', text: 'Admins' }],
    proof: `test('the admin is locked out', async () => { assert.strictEqual((await GET('/admin/Customers', as('admin'))).status, 403) })`,
  },
  {
    id: 'authz-role-typo-restrict', category: 'authz', title: "@restrict grants to 'Aprover'",
    bug: 'Typo in a @restrict role: approvers can no longer read or approve.',
    edits: [{ file: SVC, find: "to: 'Approver' }", replace: "to: 'Aprover' }" }],
    expect: [{ check: 'rule:unknown-role', text: 'Aprover' }],
    proof: `test('the approver cannot approve', async () => { assert.strictEqual((await POST('${act(O2, 'approve')}', {}, as('carol'))).status, 403) })`,
  },
  {
    id: 'authz-grant-typo', category: 'authz', title: "@restrict grants 'aprove' (no such action)",
    bug: 'Typo in a grant: the action approve is granted to nobody.',
    edits: [{ file: SVC, find: "'READ', 'approve', 'reject'", replace: "'READ', 'aprove', 'reject'" }],
    expect: [{ check: 'rule:unknown-grant', text: 'aprove' }],
    also: ['authz'],
    proof: `test('the approver cannot approve', async () => { assert.strictEqual((await POST('${act(O2, 'approve')}', {}, as('carol'))).status, 403) })`,
  },
  {
    id: 'authz-row-filter-dropped', category: 'authz', title: "Buyer grant loses where: 'createdBy = $user'",
    bug: 'Every buyer reads and edits every order (cross-user access).',
    edits: [{ file: SVC, find: ", where: 'createdBy = $user'", replace: '' }],
    expect: [{ check: 'authz', text: 'Orders READ' }],
    proof: `test("bob reads alice's orders", async () => { const r = await GET('/orders/Orders?$filter=IsActiveEntity eq true', as('bob')); assert.ok(r.data.value.some(o => o.createdBy === 'alice')) })`,
  },
  {
    id: 'authz-commented-grant', category: 'authz', title: 'Approver grant commented out',
    bug: 'Someone commented out a grant while debugging; approvers are locked out.',
    edits: [{ file: SVC, find: APPROVER_GRANT, replace: `// ${APPROVER_GRANT}` }],
    expect: [{ check: 'rule:commented-out-grant' }],
    also: ['authz', 'risk:noimpl'],
    proof: `test('the approver cannot read orders', async () => { assert.strictEqual((await GET('/orders/Orders', as('carol'))).status, 403) })`,
  },
  {
    id: 'authz-writable-owner', category: 'authz', title: 'Row filter on a plain writable owner field',
    bug: "Rows are filtered by owner = $user, but owner is writable: a buyer can hand an order to someone else.",
    edits: [
      { file: 'db/schema.cds', find: '  title    : String(100) @mandatory;', replace: '  title    : String(100) @mandatory;\n  owner    : String(255);' },
      { file: SVC, find: "where: 'createdBy = $user'", replace: "where: 'owner = $user'" },
    ],
    expect: [{ check: 'rule:writable-owner-field' }],
    also: ['authz', 'risk:row-level'],
  },
  {
    id: 'authz-pii-projection', category: 'authz', title: 'Customers with e-mail re-exposed to every buyer',
    bug: 'A new projection on Customers in OrderService exposes e-mail and phone to any authenticated user.',
    edits: [{ file: SVC, find: '  @readonly entity OrderStatus', replace: '  @readonly @cds.redirection.target: false entity CustomerContacts as projection on sales.Customers;\n  @readonly entity OrderStatus' }],
    expect: [{ check: 'risk:pii-open', text: 'CustomerContacts' }],
    also: ['authz'],
    proof: `test('alice reads customer phone numbers', async () => { const r = await GET('/orders/CustomerContacts', as('alice')); assert.strictEqual(r.status, 200); assert.ok(r.data.value[0].phone) })`,
  },
  {
    id: 'authz-custom-route', category: 'authz', title: 'Debug express route in server.js',
    bug: 'A bootstrap route returns all orders without any authentication.',
    edits: [{ file: 'server.js', write: "const cds = require('@sap/cds')\ncds.on('bootstrap', app => {\n  app.get('/debug/orders', async (req, res) => res.json(await SELECT.from('sales.Orders')))\n})\nmodule.exports = cds.server\n" }],
    expect: [{ check: 'custom-route', text: '/debug/orders' }],
    proof: `test('anonymous dumps all orders', async () => { const r = await GET('/debug/orders'); assert.strictEqual(r.status, 200); assert.ok(r.data.length >= 3) })`,
  },

  // ---------------- handlers and actions ----------------
  {
    id: 'action-handler-removed', category: 'cap', title: 'reject has no handler',
    bug: 'The reject handler was deleted; the action is still in the service and the UI.',
    edits: [{ file: IMPL, find: REJECT_HANDLER, replace: '' }],
    expect: [{ check: 'action-without-handler', text: 'reject' }, { check: 'risk:noimpl', text: 'reject' }],
    also: ['authz', 'state-transition'],
    proof: `test('reject is not implemented', async () => { const r = await POST('${act(O2, 'reject')}', { reason: 'x' }, as('carol')); assert.ok(r.status >= 500, 'status ' + r.status) })`,
  },
  {
    id: 'action-handler-typo', category: 'cap', title: "Handler registered for 'aprove'",
    bug: 'Typo in the event name: approve has no handler, the aprove handler never runs.',
    edits: [{ file: IMPL, find: "this.on('approve', Orders", replace: "this.on('aprove', Orders" }],
    expect: [{ check: 'action-without-handler', text: 'approve' }, { check: 'rule:orphan-handler', text: 'aprove' }],
    also: ['risk:noimpl', 'authz', 'state-transition'],
    proof: `test('approve is not implemented', async () => { const r = await POST('${act(O2, 'approve')}', {}, as('carol')); assert.ok(r.status >= 500, 'status ' + r.status) })`,
  },
  {
    id: 'action-orphan-handler', category: 'cap', title: 'Handler for an action the service does not declare',
    bug: "this.on('cancel', Orders) is dead code: the service has no cancel action.",
    edits: [addHandler("    this.on('cancel', Orders, async req => {\n      await UPDATE(Orders, req.params[0].ID).with({ status_code: 'R' })\n    })")],
    expect: [{ check: 'rule:orphan-handler', text: 'cancel' }],
  },
  {
    id: 'action-null-deref', category: 'cap', title: 'Not-found guard dereferences the missing row',
    bug: 'The 404 message reads order.ID from undefined: a TypeError and a 500 instead of a 404.',
    edits: [{ file: IMPL, find: "      if (!order) return req.reject(404, 'Order not found')\n      if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be approved')",
      replace: "      if (!order) return req.reject(404, `Order ${order.ID} not found`)\n      if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be approved')" }],
    expect: [{ check: 'rule:null-deref-in-guard' }],
  },
  {
    id: 'action-max-plus-one', category: 'cap', title: 'Order number = max + 1',
    bug: 'Two parallel creates read the same max and get the same order number.',
    edits: [
      { file: 'db/schema.cds', find: '  title    : String(100) @mandatory;', replace: '  title    : String(100) @mandatory;\n  orderNo  : Integer;' },
      addHandler("    this.before('CREATE', Orders, async req => {\n      const { max } = await SELECT.one.from(Orders).columns('max(orderNo) as max')\n      req.data.orderNo = (max ?? 0) + 1\n    })"),
    ],
    expect: [{ check: 'rule:max-plus-one-id' }],
  },
  {
    id: 'action-hard-coded-currency', category: 'cap', title: "Currency forced to 'EUR' in a handler",
    bug: 'Every order is stored in EUR whatever the customer currency is.',
    edits: [addHandler("    this.before('CREATE', Orders, req => { req.data.currency = 'EUR' })")],
    expect: [{ check: 'rule:hard-coded-currency' }],
  },

  // ---------------- UI promises the server does not keep ----------------
  {
    id: 'ui-only-action-guard', category: 'ui-promise', title: 'approve loses its status check',
    bug: '@Core.OperationAvailable hides approve unless status = S, but the server approves open orders too.',
    edits: [{ file: IMPL, find: `      ${APPROVE_GUARD}\n`, replace: '' }],
    expect: [{ check: 'ui-promise:ui-only', text: 'approve' }, { check: 'risk:ui-only', text: 'approve' }],
    also: ['state-transition'],
    proof: `test('carol approves an open order', async () => { const r = await POST('${act(O1, 'approve')}', {}, as('carol')); assert.strictEqual(r.status, 200) })`,
  },
  {
    id: 'ui-partial-action-guard', category: 'ui-promise', title: "approve checks status != 'A' instead of = 'S'",
    bug: 'The UI offers approve only for submitted orders; the server also approves open and rejected ones.',
    edits: [{ file: IMPL, find: APPROVE_GUARD, replace: "if (order.status_code === 'A') return req.reject(409, 'Already approved')" }],
    expect: [{ check: 'risk:partial', text: 'approve' }, { check: 'state-transition', text: 'approve' }],
    also: ['ui-promise:partial'],
    proof: `test('carol approves an open order', async () => { const r = await POST('${act(O1, 'approve')}', {}, as('carol')); assert.strictEqual(r.status, 200) })`,
  },
  {
    id: 'probe-static-readonly', category: 'ui-promise', probe: true, title: 'status read-only via @Common.FieldControl: #ReadOnly',
    bug: 'No bug: @readonly replaced by the static @Common.FieldControl: #ReadOnly, which CAP enforces like @readonly (the proof shows the server ignores the value).',
    edits: [{ file: ANN, find: '  status   @readonly;', replace: '  status   @Common.FieldControl: #ReadOnly;' }],
    forbid: [{ check: 'ui-promise:ui-only' }, { check: 'risk:ui-only' }],
    proof: `test('the server ignores status on create', async () => {
  const d = await POST('/orders/Orders', { title: 'x', status_code: 'A' }, as('alice'))
  assert.strictEqual(d.status, 201)
  const a = await POST('/orders/Orders(ID=' + d.data.ID + ',IsActiveEntity=false)/OrderService.draftActivate', {}, as('alice'))
  assert.strictEqual(a.data.status_code, 'O')
})`,
  },
  {
    id: 'probe-static-mandatory', category: 'ui-promise', probe: true, title: 'title mandatory via @Common.FieldControl: #Mandatory',
    bug: 'No bug: @mandatory moved to the static @Common.FieldControl: #Mandatory, which CAP enforces like @mandatory (the proof shows a 400).',
    edits: [
      { file: 'db/schema.cds', find: '  title    : String(100) @mandatory;', replace: '  title    : String(100);' },
      { file: ANN, find: '  total    @readonly;', replace: '  total    @readonly;\n  title    @Common.FieldControl: #Mandatory;' },
    ],
    forbid: [{ check: 'ui-promise:ui-only' }, { check: 'risk:ui-only' }],
    proof: `test('an order without title is refused', async () => {
  const d = await POST('/orders/Orders', { currency: 'USD' }, as('alice'))
  const a = await POST('/orders/Orders(ID=' + d.data.ID + ',IsActiveEntity=false)/OrderService.draftActivate', {}, as('alice'))
  assert.strictEqual(a.status, 400)
})`,
  },
  {
    id: 'transition-wrong-target', category: 'ui-promise', title: 'reject sets status A (approved)',
    bug: 'Copy-paste: reject moves the order to Approved. Static checks cannot know that "reject" should not mean A.',
    detectable: false,
    edits: [{ file: IMPL, find: "      await UPDATE(Orders, ID).with({ status_code: 'R' })", replace: "      await UPDATE(Orders, ID).with({ status_code: 'A' })" }],
    expect: [{ check: 'state-transition', text: 'reject' }],
    proof: `test('reject approves', async () => { const r = await POST('${act(O2, 'reject')}', { reason: 'x' }, as('carol')); assert.strictEqual(r.data.status_code, 'A') })`,
  },

  // ---------------- SQL ----------------
  {
    id: 'sql-injection-native', category: 'sql', title: 'Search builds native SQL from the request',
    bug: "req.data.q is pasted into a SQL string: q = x' UNION SELECT ... reads any table.",
    edits: [
      { file: SVC, find: '  event OrderApproved', replace: '  function searchCustomers(q : String) returns array of { ID : UUID; name : String };\n\n  event OrderApproved' },
      addHandler("    this.on('searchCustomers', async req => {\n      return cds.run(`SELECT ID, name FROM sales_Customers WHERE name LIKE '%${req.data.q}%'`)\n    })"),
    ],
    expect: [{ check: 'native-sql' }, { check: 'rule:sql-injection', text: 'req.data.q' }],
    also: ['authz', 'risk:noimpl'],
    proof: `test('UNION reads e-mail addresses', async () => {
  const q = encodeURIComponent("'x'' UNION SELECT ID, email AS name FROM sales_Customers --'")
  const r = await GET('/orders/searchCustomers(q=' + q + ')', as('alice'))
  assert.ok(r.data.value.some(c => String(c.name).includes('@')), JSON.stringify(r.data))
})`,
  },
  {
    id: 'sql-injection-cql-string', category: 'sql', title: 'CQL where clause built from a template string',
    bug: ".where(`name like '%${q}%'`) parses user input as CQL: q = x' or name like '% returns every row.",
    edits: [
      { file: SVC, find: '  event OrderApproved', replace: '  function searchCustomers(q : String) returns array of Customers;\n\n  event OrderApproved' },
      addHandler("    this.on('searchCustomers', async req => {\n      const { Customers } = this.entities\n      return SELECT.from(Customers).columns('ID', 'name').where(`name like '%${req.data.q}%'`)\n    })"),
    ],
    expect: [{ check: 'rule:sql-injection', text: 'req.data.q' }],
    also: ['authz', 'risk:noimpl'],
    proof: `test('an injected or returns every customer', async () => {
  const q = encodeURIComponent("'Nobody'' or name like ''%'")
  const r = await GET('/orders/searchCustomers(q=' + q + ')', as('alice'))
  assert.strictEqual(r.data.value.length, 2, JSON.stringify(r.data))
})`,
  },
  {
    id: 'sql-hana-only', category: 'sql', title: 'HANA-only SQL in submit',
    bug: 'FROM DUMMY only exists on HANA: submit fails on SQLite, so no local test reaches it.',
    edits: [{ file: IMPL, find: "      await UPDATE(Orders, ID).with({ status_code: 'S' })", replace: "      const [{ NOW }] = await cds.run('SELECT CURRENT_UTCTIMESTAMP AS NOW FROM DUMMY')\n      await UPDATE(Orders, ID).with({ status_code: 'S', modifiedAt: NOW })" }],
    expect: [{ check: 'native-sql', text: 'DUMMY' }, { check: 'risk:native-sql' }],
    proof: `test('submit fails on SQLite', async () => { const r = await POST('${act(O1, 'submit')}', {}, as('alice')); assert.ok(r.status >= 500, 'status ' + r.status) })`,
  },
  {
    id: 'sql-db-branch', category: 'sql', title: 'if (cds.db.kind === "hana") branch',
    bug: 'The HANA branch never runs in SQLite tests.',
    edits: [{ file: IMPL, find: "      await UPDATE(Orders, ID).with({ status_code: 'S' })", replace: "      if (cds.db.kind === 'hana') await cds.run(`UPDATE sales_Orders SET status_code = 'S' WHERE ID = ?`, [ID])\n      else await UPDATE(Orders, ID).with({ status_code: 'S' })" }],
    expect: [{ check: 'risk:db-branch' }],
    also: ['native-sql'],
  },

  // ---------------- events and integration ----------------
  {
    id: 'event-emit-undeclared', category: 'events', title: "emit('OrderApprovedd')",
    bug: 'Typo in the emitted event name: subscribers of OrderApproved never hear about approvals.',
    edits: [{ file: IMPL, find: "this.emit('OrderApproved'", replace: "this.emit('OrderApprovedd'" }],
    expect: [{ check: 'rule:unknown-event', text: 'OrderApprovedd' }],
  },
  {
    id: 'event-subscribe-typo', category: 'events', title: "Subscriber listens to 'OrderAproved'",
    bug: 'An audit subscriber on another service listens to an event name that is never emitted.',
    edits: [
      { file: 'srv/audit-service.cds', write: "namespace audit;\n\n@requires: 'Admin'\nservice AuditService {\n  entity Log { key ID : UUID; event : String; ref : UUID; at : Timestamp; }\n}\n" },
      { file: 'srv/audit-service.js', write: "const cds = require('@sap/cds')\n\nmodule.exports = class AuditService extends cds.ApplicationService {\n  async init() {\n    const orders = await cds.connect.to('OrderService')\n    orders.on('OrderAproved', msg => INSERT.into(this.entities.Log).entries({ ID: cds.utils.uuid(), event: msg.event, ref: msg.data.order, at: new Date() }))\n    return super.init()\n  }\n}\n" },
    ],
    expect: [{ check: 'rule:unknown-event', text: 'OrderAproved' }],
    also: ['risk:events-untested'],
  },
  {
    id: 'event-subscriber-untested', category: 'events', title: 'Audit subscriber without a test',
    bug: 'A subscriber writes the audit log on OrderApproved; no test emits the event and checks the log (the existing test only mentions the event name).',
    edits: [
      { file: 'srv/audit-service.cds', write: "namespace audit;\n\n@requires: 'Admin'\nservice AuditService {\n  entity Log { key ID : UUID; event : String; ref : UUID; at : Timestamp; }\n}\n" },
      { file: 'srv/audit-service.js', write: "const cds = require('@sap/cds')\n\nmodule.exports = class AuditService extends cds.ApplicationService {\n  async init() {\n    const orders = await cds.connect.to('OrderService')\n    orders.on('OrderApproved', msg => INSERT.into(this.entities.Log).entries({ ID: cds.utils.uuid(), event: msg.event, ref: msg.data.order, at: new Date() }))\n    return super.init()\n  }\n}\n" },
    ],
    expect: [{ check: 'risk:events-untested', text: 'OrderApproved' }],
  },
  {
    id: 'remote-untested', category: 'events', title: 'Remote business partner API without a test double',
    bug: 'Submit calls a remote OData API; no test mocks it, so timeouts and 4xx answers are untested.',
    edits: [
      { file: 'srv/external/API_BP.cds', write: "@cds.external: true\nservice API_BP {\n  entity Partners { key ID : String(10); name : String; blocked : Boolean; }\n}\n" },
      { file: 'package.json', json: j => { j.cds.requires.API_BP = { kind: 'odata', model: 'srv/external/API_BP' } } },
      { file: IMPL, find: "      await UPDATE(Orders, ID).with({ status_code: 'S' })", replace: "      const bp = await cds.connect.to('API_BP')\n      const partner = await bp.run(SELECT.one.from('API_BP.Partners').where({ ID: '1000' }))\n      if (partner?.blocked) return req.reject(409, 'Customer is blocked')\n      await UPDATE(Orders, ID).with({ status_code: 'S' })" },
    ],
    expect: [{ check: 'risk:remote-untested', text: 'API_BP' }],
  },

  // ---------------- model layering ----------------
  {
    id: 'layer-ui-on-domain', category: 'cap', title: 'UI annotations written on the domain entity',
    bug: 'app/ annotates sales.Orders (db layer) instead of the service projection: every service gets the UI texts.',
    edits: [{ file: ANN, append: "\nusing { sales } from '../../db/schema';\nannotate sales.Orders with @UI.Identification: [{ Value: title }] {\n  title @title: 'Order title';\n};\n" }],
    expect: [{ check: 'pattern:UI annotations directly on domain entities' }],
  },
]
