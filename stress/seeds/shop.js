// Held-out round on the shop base (TypeScript CAP service + freestyle UI5 app). These seeds were written after
// the fixes of the first round and scored once before any further change, so their first result measures how
// well the checks generalise to a different app (results of that first run: README.md, "Held-out round").
const IMPL = 'srv/catalog-service.ts', SVC = 'srv/catalog-service.cds', CTRL = 'app/shop/webapp/controller/Main.controller.js', VIEW = 'app/shop/webapp/view/Main.view.xml'
const MANIFEST = 'app/shop/webapp/manifest.json'
const B1 = 'b0000000-0000-0000-0000-000000000001'
const N1 = 'c0000000-0000-0000-0000-000000000001', S2 = 'c0000000-0000-0000-0000-000000000002'
const carla = "as('carla')"
const CANCEL_GUARD = "      if (order.status !== 'N') return req.reject(409, 'Only new orders can be cancelled')\n"
const CANCEL_HANDLER = "    this.on('cancel', Orders, async req => {\n      const ID = (req.params[0] as any).ID ?? req.params[0]\n      const order = await SELECT.one.from(Orders, ID).columns('status', 'quantity', 'book_ID')\n      if (!order) return req.reject(404, 'Order not found')\n      if (order.status !== 'N') return req.reject(409, 'Only new orders can be cancelled')\n      await UPDATE(Orders, ID).with({ status: 'C' })\n      await UPDATE(Books, order.book_ID).with({ stock: { '+=': order.quantity } })\n      return SELECT.one.from(Orders, ID)\n    })\n"
const SUBMIT_HANDLER_START = "    this.on('submitOrder', async req => {"

exports.base = 'shop'
exports.group = 'held-out'
exports.seeds = [
  // ---------------- TypeScript service ----------------
  {
    id: 'ts-unbound-action-no-handler', category: 'cap', title: 'submitOrder handler removed (TS)',
    bug: 'The unbound action submitOrder has no handler any more; the UI still calls it.',
    edits: [{ file: IMPL, find: SUBMIT_HANDLER_START, replace: "    false && this.on('submitOrder_removed', async req => {" }],
    expect: [{ check: 'action-without-handler', text: 'submitOrder' }, { check: 'risk:noimpl', text: 'submitOrder' }],
    also: ['rule:orphan-handler', 'authz'],
    proof: `test('submitOrder answers 501', async () => { const r = await POST('/catalog/submitOrder', { book: '${B1}', quantity: 1 }, ${carla}); assert.strictEqual(r.status, 501) })`,
  },
  {
    id: 'ts-cancel-guard-removed', category: 'ui-promise', title: 'cancel no longer checks the status (TS, CDS expression)',
    bug: '@Core.OperationAvailable: ($self.status = \'N\') hides cancel for shipped orders; the server cancels them anyway and puts the stock back.',
    edits: [{ file: IMPL, find: CANCEL_GUARD, replace: '' }],
    expect: [{ check: 'ui-promise:ui-only', text: 'cancel' }, { check: 'risk:ui-only', text: 'cancel' }],
    also: ['state-transition'],
    proof: `test('carla cancels a shipped order', async () => { const r = await POST('/catalog/Orders(${S2})/CatalogService.cancel', {}, ${carla}); assert.strictEqual(r.status, 200) })`,
  },
  {
    id: 'ts-sql-injection', category: 'sql', title: 'Search by title with a template string (TS)',
    bug: 'A function searchBooks(title) pastes req.data.title into native SQL.',
    edits: [
      { file: SVC, find: '  event BookOrdered', replace: '  function searchBooks(title : String) returns array of Books;\n\n  event BookOrdered' },
      { file: IMPL, find: '    return super.init()', replace: "    this.on('searchBooks', async req => {\n      const title: string = req.data.title\n      return cds.run(`SELECT ID, title, stock FROM shop_Books WHERE title = '${title}'`)\n    })\n\n    return super.init()" },
    ],
    expect: [{ check: 'rule:sql-injection' }, { check: 'native-sql' }],
    also: ['authz'],
    proof: `test('a quote ends the string: every book comes back', async () => {
  const q = encodeURIComponent("'x'' OR ''1''=''1'")
  const r = await GET('/catalog/searchBooks(title=' + q + ')', ${carla})
  assert.strictEqual(r.data.value.length, 2, JSON.stringify(r.data))
})`,
  },
  {
    id: 'ts-null-deref', category: 'cap', title: 'Not-found message reads row.ID (TS)',
    bug: 'if (!row) req.reject(404, `Book ${row.ID} ...`): TypeError and 500 for an unknown book.',
    edits: [{ file: IMPL, find: "if (!row) return req.reject(404, `Book ${book} not found`)", replace: "if (!row) return req.reject(404, `Book ${row.ID} not found`)" }],
    expect: [{ check: 'rule:null-deref-in-guard' }],
    proof: `test('unknown book gives 500', async () => { const r = await POST('/catalog/submitOrder', { book: 'b0000000-0000-0000-0000-00000000dead', quantity: 1 }, ${carla}); assert.strictEqual(r.status, 500) })`,
  },
  {
    id: 'ts-emit-typo', category: 'events', title: "emit('BookOrderd') (TS)",
    bug: 'Typo in the emitted event: BookOrdered subscribers never fire.',
    edits: [{ file: IMPL, find: "this.emit('BookOrdered'", replace: "this.emit('BookOrderd'" }],
    expect: [{ check: 'rule:unknown-event', text: 'BookOrderd' }],
  },
  {
    id: 'ts-role-typo', category: 'authz', title: "@requires: 'Customers' on submitOrder",
    bug: 'Typo in the role on the action: no customer can order.',
    edits: [{ file: SVC, find: "  @requires: 'Customer'\n", replace: "  @requires: 'Customers'\n" }],
    expect: [{ check: 'rule:unknown-role', text: 'Customers' }],
    also: ['authz'],
    proof: `test('carla cannot order', async () => { const r = await POST('/catalog/submitOrder', { book: '${B1}', quantity: 1 }, ${carla}); assert.strictEqual(r.status, 403) })`,
  },
  {
    id: 'ts-admin-open', category: 'authz', title: 'AdminService loses @requires (TS app)',
    bug: 'Anonymous callers can change books and orders.',
    edits: [{ file: 'srv/admin-service.cds', find: "@requires: 'ShopAdmin'\n", replace: '' }],
    expect: [{ check: 'risk:open-svc', text: 'AdminService' }],
    also: ['authz'],
    proof: `test('anonymous reads orders', async () => { assert.strictEqual((await GET('/admin/Orders')).status, 200) })`,
  },
  {
    id: 'ts-method-reference', category: 'shape', title: 'Handlers as class methods without bind (TS)',
    bug: 'No bug: this.on("cancel", Orders, this.onCancel) with the guard inside the method.',
    edits: [
      { file: IMPL, find: CANCEL_HANDLER, replace: "    this.on('cancel', Orders, this.onCancel)\n" },
      { file: IMPL, find: '\n    return super.init()\n  }\n}', replace: "\n    return super.init()\n  }\n\n  async onCancel(req) {\n    const { Orders, Books } = this.entities\n    const ID = req.params[0].ID ?? req.params[0]\n    const order = await SELECT.one.from(Orders, ID).columns('status', 'quantity', 'book_ID')\n    if (!order) return req.reject(404, 'Order not found')\n    if (order.status !== 'N') return req.reject(409, 'Only new orders can be cancelled')\n    await UPDATE(Orders, ID).with({ status: 'C' })\n    await UPDATE(Books, order.book_ID).with({ stock: { '+=': order.quantity } })\n    return SELECT.one.from(Orders, ID)\n  }\n}" },
    ],
    graph: [{ rel: 'handles', to: '^action:CatalogService\\.Orders\\.cancel$' }],
    forbid: [{ check: 'action-without-handler' }, { check: 'ui-promise:ui-only' }],
    proof: `test('cancel still refuses shipped orders', async () => { assert.strictEqual((await POST('/catalog/Orders(${S2})/CatalogService.cancel', {}, ${carla})).status, 409) })`,
  },
  {
    id: 'ts-stock-unchecked', category: 'cap', title: 'submitOrder no longer checks the stock',
    bug: 'Stock can go negative. No annotation states the rule, so only @assert.range on stock (not checked on UPDATE with -=) or a test would catch it.',
    detectable: false,
    edits: [{ file: IMPL, find: "      if (quantity > row.stock) return req.reject(409, `Only ${row.stock} left`)\n", replace: '' }],
    expect: [{ check: 'risk:*', text: 'stock' }],
    proof: `test('ordering a sold-out book succeeds', async () => { const r = await POST('/catalog/submitOrder', { book: 'b0000000-0000-0000-0000-000000000002', quantity: 1 }, ${carla}); assert.strictEqual(r.status, 200) })`,
  },

  // ---------------- freestyle UI5 ----------------
  {
    id: 'ui5-deprecated-jquery-sap', category: 'ui5', title: 'jQuery.sap.log in a controller',
    bug: 'Deprecated jQuery.sap API (removed in UI5 2.x).',
    edits: [{ file: CTRL, find: '      const item = this.byId("books").getSelectedItem();', replace: '      jQuery.sap.log.info("order pressed");\n      const item = this.byId("books").getSelectedItem();' }],
    expect: [{ check: 'lint:ui5-lint:*' }],
    also: ['risk:ui5-errors'],
  },
  {
    id: 'ui5-global-access', category: 'ui5', title: 'sap.m.MessageToast used as a global',
    bug: 'Global access instead of a module dependency: breaks with async loading and UI5 2.x.',
    edits: [{ file: CTRL, find: '        MessageToast.show(this.getText("ordered"));', replace: '        sap.m.MessageToast.show(this.getText("ordered"));' }],
    expect: [{ check: 'lint:ui5-lint:no-globals' }],
    also: ['risk:ui5-errors'],
  },
  {
    id: 'ui5-sync-loading', category: 'ui5', title: 'sap.ui.requireSync in a controller',
    bug: 'Synchronous module loading (deprecated, blocks the UI thread).',
    edits: [{ file: CTRL, find: '      } catch (e) {\n        MessageBox.error(e.message);', replace: '      } catch (e) {\n        sap.ui.requireSync("sap/m/MessageBox").error(e.message);' }],
    expect: [{ check: 'lint:ui5-lint:*' }],
    also: ['risk:ui5-errors'],
  },
  {
    id: 'ui5-binding-unknown-set', category: 'ui5', title: "List bound to '/Bookz'",
    bug: 'The view binds an entity set the service does not have: the list stays empty at runtime.',
    edits: [{ file: VIEW, find: "items=\"{path: '/Books',", replace: "items=\"{path: '/Bookz'," }],
    expect: [{ check: 'rule:ui5-unknown-binding*', text: 'Bookz' }],
  },
  {
    id: 'ui5-action-unknown', category: 'ui5', title: "Controller calls '/submitOrdr(...)'",
    bug: 'Typo in the action path: the order button always fails.',
    edits: [{ file: CTRL, find: 'bindContext("/submitOrder(...)")', replace: 'bindContext("/submitOrdr(...)")' }],
    expect: [{ check: 'rule:ui5-unknown-binding*', text: 'submitOrdr' }],
  },
  {
    id: 'ui5-datasource-wrong-path', category: 'ui5', title: 'manifest dataSource uri /catalogue/',
    bug: 'The app talks to a path the server does not serve (the service is at /catalog).',
    edits: [{ file: MANIFEST, find: '"uri": "/catalog/"', replace: '"uri": "/catalogue/"' }],
    expect: [{ check: 'rule:ui5-unknown-binding*', text: 'catalogue' }],
  },
  {
    id: 'ui5-inline-script', category: 'ui5', title: 'Inline script in index.html',
    bug: 'An inline <script> breaks a strict Content Security Policy.',
    edits: [{ file: 'app/shop/webapp/index.html', find: '</head>', replace: '  <script>window.shopStarted = Date.now();</script>\n</head>' }],
    expect: [{ check: 'lint:ui5-lint:csp-unsafe-inline-script' }],
  },
]
