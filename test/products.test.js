// Unit tests for the step products (lib/products/): every step writes its product in the same shape,
// the impact walk follows the dependency direction, the query CLI answers in Markdown, standard formats
// are well formed (SARIF 2.1.0, CTRF), and the products pick up CI results (Jest) and a base run (deltas).
// Run: node --test 'test/*.test.js'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const I = require('../lib/products/impact')
const { ORDER } = require('../lib/products')

const BIN = f => path.join(__dirname, '..', 'bin', f)
const env = { ...process.env, DISCOVERY_ADDONS_OFF: 'all', DISCOVERY_IMAGES: 'off' }
const node = (f, ...a) => execFileSync(process.execPath, [BIN(f), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env, timeout: 300000 })
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'))

function app(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-'))
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text) }
  return root
}

test('impact: a db entity reaches its projection, the handler on it, the test that calls it; not the other way', () => {
  const G = { nodes: [
    { id: 'entity:Orders', type: 'Entity', label: 'Orders', layer: 'model' }, { id: 'entity:Items', type: 'Entity', label: 'Items', layer: 'model' },
    { id: 'svcentity:S.Orders', type: 'ServiceEntity', label: 'S.Orders', layer: 'service' }, { id: 'handler:h', type: 'Handler', label: 'on approve', layer: 'code' },
    { id: 'rule:r', type: 'Rule', label: 'rejection', layer: 'code' }, { id: 'test:t', type: 'ExistingTest', label: 't', layer: 'tests' }, { id: 'role:admin', type: 'Role', label: 'admin', layer: 'access' },
    { id: 'user:alice', type: 'MockUser', label: 'alice', layer: 'access' }],
  edges: [['svcentity:S.Orders', 'projects_on', 'entity:Orders'], ['handler:h', 'handles', 'svcentity:S.Orders'], ['handler:h', 'enforces', 'rule:r'], ['test:t', 'mentions', 'svcentity:S.Orders'],
    ['svcentity:S.Orders', 'requires', 'role:admin'], ['user:alice', 'has_role', 'role:admin'], ['entity:Items', 'associates', 'entity:Orders']] }
  const ids = r => r.map(x => x.id).sort()
  assert.deepStrictEqual(ids(I.impact(G, 'entity:Orders', { depth: 5 })), ['handler:h', 'role:admin', 'rule:r', 'svcentity:S.Orders', 'test:t'], 'role reached, its users not; association only on request')
  assert.ok(ids(I.impact(G, 'entity:Orders', { depth: 5, assoc: true })).includes('entity:Items'))
  assert.deepStrictEqual(ids(I.impact(G, 'test:t', { depth: 5 })), [], 'nothing depends on a test')
  assert.strictEqual(I.impact(G, 'entity:Orders', { depth: 1 }).length, 1, 'depth limits the walk')
  assert.match(I.markdown(G, 'entity:Orders', I.impact(G, 'entity:Orders', { depth: 3 }), { depth: 3 }), /Tests to run first: t/)
})

test('a run publishes every step product in the same shape; query answers; CI results and a base run show up', { timeout: 300000 }, () => {
  const root = app({
    'package.json': JSON.stringify({ name: 'mini', dependencies: { '@sap/cds': '*' }, cds: { requires: { auth: { kind: 'mocked', users: { alice: { roles: ['admin'] }, bob: {} } } } } }),
    'db/schema.cds': 'namespace mini;\nentity Orders {\n  key ID : Integer;\n  status : String(1);\n  amount : Integer;\n  items : Composition of many Items on items.order = $self;\n}\nentity Items {\n  key ID : Integer;\n  order : Association to Orders;\n}\n',
    'srv/service.cds': "using mini from '../db/schema';\nservice OrderService {\n  @(restrict: [{ grant: '*', to: 'admin' }])\n  entity Orders as projection on mini.Orders actions {\n    action approve();\n  };\n  entity Items as projection on mini.Items;\n}\nannotate OrderService.Orders with @(UI.LineItem: [{ Value: status }]);\n",
    'srv/service.js': "const cds = require('@sap/cds')\nmodule.exports = class OrderService extends cds.ApplicationService { init() {\n  const { Orders } = this.entities\n  this.before('UPDATE', Orders, req => { if (req.data.amount < 0) req.reject(400, 'negative') })\n  this.on('approve', Orders, req => UPDATE(req.subject).with({ status: 'A' }))\n  return super.init()\n} }\n",
  })
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'))
  node('pipeline.js', root, out)
  const M = read(path.join(out, 'manifest.json'))
  assert.strictEqual(M.stages.find(s => s.id === 'products')?.status, 'ran')
  const list = read(path.join(out, 'steps/products.json'))
  assert.deepStrictEqual(list.map(s => s.id), ORDER)
  for (const s of list) {
    assert.ok(!['failed'].includes(s.status), `${s.id} failed: ${s.why}`)
    for (const f of ['summary.json', 'README.md', 'index.html']) assert.ok(fs.existsSync(path.join(out, 'steps', s.id, f)), `${s.id}/${f}`)
    for (const f of [...s.views, ...s.data, ...s.pages]) assert.ok(fs.existsSync(path.join(out, 'steps', s.id, f)), `${s.id}: listed ${f} exists`)
    for (const v of s.views) assert.match(fs.readFileSync(path.join(out, 'steps', s.id, v), 'utf8'), /^<svg[^>]*xmlns/)
  }
  for (const f of ['index.md', 'index.html']) assert.ok(fs.existsSync(path.join(out, 'steps', f)))
  const by = Object.fromEntries(list.map(s => [s.id, s]))
  assert.strictEqual(by.model.status, 'ok')
  assert.ok(by.model.pages.includes('explorer.html'))
  assert.ok(by.model.data.includes('data/impact/Orders.md'))
  assert.match(fs.readFileSync(path.join(out, 'steps/model/README.md'), 'utf8'), /```mermaid\nerDiagram/)
  assert.strictEqual(by.behaviour.kpis.find(k => k.label === 'handlers').value, 2)
  assert.strictEqual(by.tests.status, 'not-run', 'no Jest results in a static run')
  assert.strictEqual(by.ai.status, 'not-run', 'mode static')
  const sarif = read(path.join(out, 'steps/checks/data/checks.sarif'))
  assert.strictEqual(sarif.version, '2.1.0')
  assert.ok(Array.isArray(sarif.runs[0].results))

  // the query CLI
  assert.match(node('query.js', out, 'impact', 'Orders'), /## Impact: change Entity `Orders`[\s\S]*OrderService\.Orders/)
  assert.match(node('query.js', out, 'who-can', 'Orders'), /alice/)
  assert.match(node('query.js', out, 'tests-for', 'srv/service.js:4'), /Closest code in the graph: (Handler|Rule)/)

  // CI: Jest results become a CTRF report; --base adds deltas
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'))
  fs.cpSync(path.join(out, 'steps'), path.join(base, 'steps'), { recursive: true })
  const jest = path.join(out, 'jest.json')
  fs.writeFileSync(jest, JSON.stringify({ startTime: 1, testResults: [{ name: '/x/test/generated/a.test.js', assertionResults: [{ fullName: 'a passes', status: 'passed', duration: 5 }, { fullName: 'b fails', status: 'failed', duration: 3, failureMessages: ['boom'] }, { fullName: 'c later', status: 'pending' }] }] }))
  node('products.js', out, '--generated', jest, '--base', base)
  const tests = read(path.join(out, 'steps/tests/summary.json'))
  assert.strictEqual(tests.status, 'bad')
  const ctrf = read(path.join(out, 'steps/tests/data/results.ctrf.json'))
  assert.deepStrictEqual([ctrf.reportFormat, ctrf.results.summary.passed, ctrf.results.summary.failed, ctrf.results.summary.skipped], ['CTRF', 1, 1, 1])
  assert.ok(read(path.join(out, 'steps/run/summary.json')).kpis.length)
})
