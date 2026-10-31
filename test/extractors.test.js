// Unit tests for the extractors the harder pilots needed: split service implementations, handlers on
// connected services and their events, remote calls, native SQL, db-kind branches, HANA-native artifacts.
// Run: node --test 'test/*.test.js'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Graph } = require('../lib/graph')
const { extractHandlersAst } = require('../lib/extract/handlers')
const { extractNative, declaredName, sourcesOf } = require('../lib/extract/native')

function app(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-'))
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text) }
  return root
}
const edges = (g, rel) => g.edges.filter(e => e.rel === rel).map(e => `${e.from} -> ${e.to}`)

test('a handler file loaded by the service impl gets the service (Poetry Slam split)', () => {
  const root = app({
    'srv/svc.js': "const cds = require('@sap/cds')\nconst slams = require('./slams')\nmodule.exports = class extends cds.ApplicationService { async init() { await slams(this) } }",
    'srv/slams.js': "module.exports = async (srv) => {\n  const { Slams } = srv.entities\n  srv.before('CREATE', Slams, req => { req.data.status = 1 })\n}",
  })
  const g = new Graph('t')
  g.node('service:S', 'Service', { name: 'S' }); g.node('svcentity:S.Slams', 'ServiceEntity', { name: 'S.Slams', service: 'S' })
  extractHandlersAst(root, g, { definitions: { S: { kind: 'service', '@impl': './svc.js', $location: { file: 'srv/svc.cds' } } } })
  const h = g.byType('Handler')[0]
  assert.strictEqual(h.props.service, 'S')
  assert.deepStrictEqual(edges(g, 'handles'), ['handler:srv/slams.js:3 -> svcentity:S.Slams'])
})

test('handlers on a connected service, event subscriptions and remote calls (bookstore mashup)', () => {
  const root = app({ 'srv/mashup.js': [
    "const cds = require('@sap/cds')",
    "cds.once('served', async () => {",
    "  const Catalog = await cds.connect.to('CatalogService')",
    "  const Reviews = await cds.connect.to('ReviewsService')",
    "  const { Books } = cds.entities('my.bookshop')",
    "  Catalog.prepend(srv => srv.on('READ', 'Books/reviews', req => Reviews.read('Reviews').where({ subject: req.params[0] })))",
    "  Reviews.on('AverageRatings.Changed', msg => UPDATE(Books, msg.data.subject).with({ rating: msg.data.rating }))",
    "})"].join('\n') })
  const g = new Graph('t')
  g.node('service:CatalogService', 'Service', { name: 'CatalogService' }); g.node('svcentity:CatalogService.Books', 'ServiceEntity', { name: 'CatalogService.Books', service: 'CatalogService' })
  g.node('remote:ReviewsService', 'ExternalService', { name: 'ReviewsService' }); g.node('entity:my.bookshop.Books', 'Entity', { name: 'my.bookshop.Books' })
  const r = extractHandlersAst(root, g, { definitions: {} })
  assert.deepStrictEqual(edges(g, 'handles'), ['handler:srv/mashup.js:6 -> svcentity:CatalogService.Books'])
  assert.deepStrictEqual(edges(g, 'subscribes'), ['handler:srv/mashup.js:7 -> event:ReviewsService.AverageRatings.Changed'])
  assert.deepStrictEqual(edges(g, 'writes'), ['handler:srv/mashup.js:7 -> entity:my.bookshop.Books'])
  assert.ok(edges(g, 'calls_service').includes('handler:srv/mashup.js:6 -> remote:ReviewsService'))
  assert.strictEqual(r.subscriptions, 1)
})

test('cds.connect.to with a class constant, native SQL and a db-kind branch', () => {
  const root = app({
    'srv/connector.js': "class C {\n  static API = 'S4_API'\n  async load(q) { const s4 = await cds.connect.to(C.API); return s4.run(q) }\n}\nmodule.exports = C",
    'srv/numbers.js': "module.exports = async (kind, name) => {\n  switch (kind) {\n    case 'hana': return cds.run(`SELECT \"${name}\".NEXTVAL AS N FROM DUMMY`)\n    case 'sqlite': return cds.run(SELECT.one.from(name))\n  }\n}",
  })
  const g = new Graph('t')
  extractHandlersAst(root, g, { definitions: {} })
  assert.deepStrictEqual(edges(g, 'connects_to'), ['file:srv/connector.js -> remote:S4_API'])
  assert.deepStrictEqual(edges(g, 'calls_service'), ['file:srv/connector.js -> remote:S4_API'])
  const f = g.nodes.get('file:srv/numbers.js').props
  assert.strictEqual(f.nativeSql.length, 1); assert.ok(f.nativeSql[0].hanaOnly)
  assert.deepStrictEqual(f.dbBranches.map(b => b.cases), [['hana', 'sqlite']])
})

test('HDI artifacts: names, sources, backing entities and code that calls them (CodeJam)', () => {
  assert.strictEqual(declaredName('PROCEDURE "sleep" ( )\n LANGUAGE SQLSCRIPT AS BEGIN END', 'hdbprocedure'), 'sleep')
  assert.strictEqual(declaredName('<Calculation:scenario xmlns:x="y" id="V_INTERACTION" a="b">', 'hdbcalculationview'), 'V_INTERACTION')
  assert.deepStrictEqual(sourcesOf('<resourceUri>APP_HEADERS</resourceUri><resourceUri>APP_ITEMS</resourceUri>', 'hdbcalculationview'), ['APP_HEADERS', 'APP_ITEMS'])
  const root = app({
    'db/src/V_INTERACTION.hdbcalculationview': '<Calculation:scenario id="V_INTERACTION"><DataSource id="H"><resourceUri>APP_HEADERS</resourceUri></DataSource>',
    'db/src/sleep.hdbprocedure': 'PROCEDURE "sleep" ( ) AS BEGIN END',
    'srv/cat.js': "module.exports = srv => srv.on('sleep', () => db.run('Call \"sleep\"()'))",
    'package.json': JSON.stringify({ cds: { requires: { db: { '[production]': { model: 'db/hana' }, '[development]': { model: 'db/sqlite' } } } } }),
  })
  const g = new Graph('t')
  g.node('entity:app.Headers', 'Entity', { name: 'app.Headers' })
  g.node('entity:V_INTERACTION', 'Entity', { name: 'V_INTERACTION', persistenceExists: 'calcview' })
  g.node('file:srv/cat.js', 'SourceFile', { path: 'srv/cat.js' })
  for (const f of ['db/src/V_INTERACTION.hdbcalculationview', 'db/src/sleep.hdbprocedure']) g.node(`dbartifact:${f}`, 'DbArtifact', { file: f, kind: path.extname(f).slice(1) })
  const r = extractNative(root, g)
  assert.deepStrictEqual(edges(g, 'backed_by'), ['entity:V_INTERACTION -> dbartifact:db/src/V_INTERACTION.hdbcalculationview'])
  assert.deepStrictEqual(edges(g, 'reads'), ['dbartifact:db/src/V_INTERACTION.hdbcalculationview -> entity:app.Headers'])
  assert.deepStrictEqual(edges(g, 'uses_native'), ['file:srv/cat.js -> dbartifact:db/src/sleep.hdbprocedure'])
  assert.strictEqual(r.variants, 2)
})

test('if-guards become comparisons from the syntax tree; the else branch is negated', () => {
  const root = app({ 'srv/s.js': [
    "module.exports = srv => srv.on('accept', 'Travels', async req => {",
    "  const t = await SELECT.one.from('Travels')",
    "  if (t.status === 'A') req.reject(400, 'already accepted')",
    "  else if (!(t.fee == null)) req.warn('fee set')",
    "})"].join('\n') })
  const g = new Graph('t')
  g.node('service:S', 'Service', { name: 'S' }); g.node('svcentity:S.Travels', 'ServiceEntity', { name: 'S.Travels', service: 'S' })
  extractHandlersAst(root, g, { definitions: { S: { kind: 'service', '@impl': './s.js', $location: { file: 'srv/s.cds' } } } })
  const rules = g.byType('Rule').sort((a, b) => a.id.localeCompare(b.id))
  assert.deepStrictEqual(rules[0].props.conds, [{ lhs: 't.status', op: '=', rhs: 'A', literal: true }])
  assert.deepStrictEqual(rules[1].props.conds.map(c => [c.lhs, c.op, c.rhs]), [['t.status', '!=', 'A'], ['t.fee', '!=', null]])
})
