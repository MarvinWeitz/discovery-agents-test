// Unusual but valid code shapes on the orders base. Most seeds plant no bug: the app behaves exactly like
// the clean one, so the right result is "nothing new". They check that each shape is still understood
// (handlers bound to their actions, graph edges present) and that no false "no handler" alarm appears.
// Seeds marked with a bug combine the shape with one planted bug that must still be found.
const SVC = 'srv/order-service.cds', IMPL = 'srv/order-service.js'
const ACT = ['submit', 'approve', 'reject']
const bound = ACT.map(a => ({ rel: 'handles', to: `^action:OrderService\\.Orders\\.${a}$` }))
const noFalseMissing = [{ check: 'action-without-handler' }, { check: 'risk:noimpl' }, { check: 'pattern:Bound actions', text: 'has no handler' }]
const O1 = 'aaaaaaaa-0000-0000-0000-000000000001', O2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const act = (id, a) => `/orders/Orders(ID=${id},IsActiveEntity=true)/OrderService.${a}`
// the same behaviour as the base, proved on every shape: approve works in S and is refused in O
const SAME = `test('approve: 409 on an open order, 200 on a submitted one', async () => {
  assert.strictEqual((await POST('${act(O1, 'approve')}', {}, as('carol'))).status, 409)
  assert.strictEqual((await POST('${act(O2, 'approve')}', {}, as('carol'))).status, 200)
})`

// transition handler body shared by the shapes: (srv, req, from, to) -> row; approving emits OrderApproved
// like the base does (the base app's own tests run on every bug-free shape and check the event)
const STEP = `async function step(srv, req, from, to) {
  const { Orders } = srv.entities
  const ID = req.params[0].ID ?? req.params[0]
  const order = await SELECT.one.from(Orders, ID).columns('status_code', 'total')
  if (!order) return req.reject(404, 'Order not found')
  if (order.status_code !== from) return req.reject(409, \`Only orders in status \${from} can do this\`)
  await UPDATE(Orders, ID).with({ status_code: to })
  if (to === 'A') await srv.emit('OrderApproved', { order: ID, total: order.total })
  return SELECT.one.from(Orders, ID)
}`

exports.base = 'orders'
exports.group = 'shapes'
exports.seeds = [
  {
    id: 'shape-loop-registration', category: 'shape', title: 'Actions registered in a loop',
    bug: 'No bug: approve and reject are registered by iterating over a table of transitions.',
    edits: [{ file: IMPL, write: `const cds = require('@sap/cds')
${STEP}

const TRANSITIONS = [['submit', 'O', 'S'], ['approve', 'S', 'A'], ['reject', 'S', 'R']]

module.exports = class OrderService extends cds.ApplicationService {
  init() {
    const { Orders } = this.entities
    this.before('UPDATE', Orders, async req => {
      const order = await SELECT.one.from(Orders, req.data.ID).columns('status_code')
      if (order && order.status_code !== 'O') req.reject(409, 'Only open orders can be changed')
    })
    for (const [action, from, to] of TRANSITIONS) this.on(action, Orders, req => step(this, req, from, to))
    return super.init()
  }
}
` }],
    graph: bound, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'shape-handler-modules', category: 'shape', title: 'Handlers in their own modules, passed as require(...)',
    bug: 'No bug: this.on("approve", Orders, require("./handlers/approve")).',
    edits: [
      { file: 'srv/handlers/transition.js', write: `${STEP}\nmodule.exports = (from, to) => function (req) { return step(this, req, from, to) }\n` },
      { file: 'srv/handlers/approve.js', write: `module.exports = require('./transition')('S', 'A')\n` },
      { file: 'srv/handlers/reject.js', write: `module.exports = require('./transition')('S', 'R')\n` },
      { file: 'srv/handlers/submit.js', write: `module.exports = require('./transition')('O', 'S')\n` },
      { file: IMPL, write: `const cds = require('@sap/cds')

module.exports = class OrderService extends cds.ApplicationService {
  init() {
    const { Orders } = this.entities
    this.on('submit', Orders, require('./handlers/submit'))
    this.on('approve', Orders, require('./handlers/approve'))
    this.on('reject', Orders, require('./handlers/reject'))
    return super.init()
  }
}
` },
    ],
    graph: bound, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'shape-bound-methods', category: 'shape', title: 'Handlers as class methods (this.onApprove.bind(this))',
    bug: 'No bug: each action is handled by a method of the service class.',
    edits: [{ file: IMPL, write: `const cds = require('@sap/cds')
${STEP}

module.exports = class OrderService extends cds.ApplicationService {
  init() {
    const { Orders } = this.entities
    this.on('submit', Orders, this.onSubmit.bind(this))
    this.on('approve', Orders, this.onApprove.bind(this))
    this.on('reject', Orders, this.onReject.bind(this))
    return super.init()
  }
  onSubmit(req) { return step(this, req, 'O', 'S') }
  onApprove(req) { return step(this, req, 'S', 'A') }
  onReject(req) { return step(this, req, 'S', 'R') }
}
` }],
    graph: bound, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'shape-service-impl-function', category: 'shape', title: 'cds.service.impl(function () { ... }) with string targets',
    bug: "No bug: the older function style, and entity targets given as strings ('Orders').",
    edits: [{ file: IMPL, write: `const cds = require('@sap/cds')
${STEP}

module.exports = cds.service.impl(function () {
  const { Orders } = this.entities
  this.on('submit', 'Orders', req => step(this, req, 'O', 'S'))
  this.on('approve', 'Orders', req => step(this, req, 'S', 'A'))
  this.on('reject', 'Orders', req => step(this, req, 'S', 'R'))
})
` }],
    graph: bound, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'shape-srv-arrow', category: 'shape', title: 'module.exports = srv => { srv.on([...], ...) } with an event array',
    bug: 'No bug: one handler for approve and reject, dispatching on req.event.',
    edits: [{ file: IMPL, write: `const cds = require('@sap/cds')
${STEP}

module.exports = srv => {
  const { Orders } = srv.entities
  srv.on('submit', Orders, req => step(srv, req, 'O', 'S'))
  srv.on(['approve', 'reject'], Orders, req => step(srv, req, 'S', req.event === 'approve' ? 'A' : 'R'))
}
` }],
    graph: bound, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'shape-impl-annotation', category: 'shape', title: "@impl points to srv/lib/orders-impl.js",
    bug: 'No bug: the implementation file does not sit next to the .cds file.',
    edits: [
      { move: [IMPL, 'srv/lib/orders-impl.js'] },
      { file: SVC, find: "@path: '/orders'", replace: "@path: '/orders'\n@impl: 'srv/lib/orders-impl.js'" },
    ],
    graph: bound, forbid: noFalseMissing, proof: SAME,
  },
  {
    id: 'shape-src-folder-bug', category: 'shape', title: 'Implementation under srv/src/, with a null-deref guard',
    bug: 'The 404 guard reads order.ID from undefined (500 instead of 404); the code sits in srv/src/.',
    edits: [
      { move: [IMPL, 'srv/src/order-service.js'] },
      { file: SVC, find: "@path: '/orders'", replace: "@path: '/orders'\n@impl: 'srv/src/order-service.js'" },
      { file: 'srv/src/order-service.js', find: "      if (!order) return req.reject(404, 'Order not found')\n      if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be approved')",
        replace: "      if (!order) return req.reject(404, `Order ${order.ID} not found`)\n      if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be approved')" },
    ],
    expect: [{ check: 'rule:null-deref-in-guard', file: 'srv/src/' }],
    graph: bound, forbid: noFalseMissing,
  },
  {
    id: 'shape-esm', category: 'shape', title: 'ES module implementation (type: module, export default class)',
    bug: 'No bug: package.json "type": "module" and an ESM service class.',
    edits: [
      { file: 'package.json', json: j => { j.type = 'module' } },
      { file: IMPL, find: "const cds = require('@sap/cds')", replace: "import cds from '@sap/cds'" },
      { file: IMPL, find: 'module.exports = class OrderService', replace: 'export default class OrderService' },
      { file: 'test/orders.test.js', delete: true },
    ],
    graph: bound, forbid: noFalseMissing,
    also: [{ check: 'risk:tests-one-user', why: 'true: the CommonJS test had to go, the only test left (the proof) runs as carol' }],
    proof: `test('approve works', async () => { assert.strictEqual((await POST('${act(O2, 'approve')}', {}, as('carol'))).status, 200) })`,
    proofExt: 'cjs',
  },
  {
    id: 'shape-cds-expression-guard-removed', category: 'shape', title: 'OperationAvailable as a CDS expression, approve guard removed',
    bug: '@Core.OperationAvailable: (status.code = \'S\') in CDS expression syntax; the server approves in any state.',
    edits: [
      { file: SVC, find: "@(Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'S' ] } })\n    action approve()", replace: "@(Core.OperationAvailable: ($self.status.code = 'S'))\n    action approve()" },
      { file: IMPL, find: "      if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be approved')\n", replace: '' },
    ],
    expect: [{ check: 'ui-promise:ui-only', text: 'approve' }, { check: 'risk:ui-only', text: 'approve' }],
    also: ['state-transition'],
    proof: `test('carol approves an open order', async () => { assert.strictEqual((await POST('${act(O1, 'approve')}', {}, as('carol'))).status, 200) })`,
  },
  {
    id: 'shape-loop-guard-removed', category: 'shape', title: 'Loop registration, approve no longer checks the status',
    bug: 'Transitions table says approve may start anywhere (from = null); the UI still hides it unless S.',
    edits: [{ file: IMPL, write: `const cds = require('@sap/cds')

const TRANSITIONS = [['submit', 'O', 'S'], ['approve', null, 'A'], ['reject', 'S', 'R']]

module.exports = class OrderService extends cds.ApplicationService {
  init() {
    const { Orders } = this.entities
    for (const [action, from, to] of TRANSITIONS) this.on(action, Orders, async req => {
      const ID = req.params[0].ID ?? req.params[0]
      const order = await SELECT.one.from(Orders, ID).columns('status_code')
      if (!order) return req.reject(404, 'Order not found')
      if (from && order.status_code !== from) return req.reject(409, \`Only orders in status \${from} can do this\`)
      await UPDATE(Orders, ID).with({ status_code: to })
      return SELECT.one.from(Orders, ID)
    })
    return super.init()
  }
}
` }],
    expect: [{ check: 'ui-promise:*', text: 'approve' }],
    also: ['risk:ui-only', 'risk:partial', 'state-transition', 'ui-promise:ui-only', 'ui-promise:partial', { check: 'rule:event-never-emitted', why: 'true: this rewrite has no emit' }],
    detectable: false,
    proof: `test('carol approves an open order', async () => { assert.strictEqual((await POST('${act(O1, 'approve')}', {}, as('carol'))).status, 200) })`,
  },
]
