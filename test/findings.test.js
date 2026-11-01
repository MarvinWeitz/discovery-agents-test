// Unit tests for the middle layer and the stages: stable ids, gap settlement, the evidence gate, the
// schemas, server.js routes and local plugins (F13, F8), and one whole static run of a small app
// followed by an AI pass (requests -> answers -> gate -> merge -> validate).
// Run: node --test 'test/*.test.js'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { Book, findingId, gapId } = require('../lib/findings/book')
const { checkEvidence } = require('../lib/evidence')
const { check } = require('../lib/schema')
const { Graph } = require('../lib/graph')

const BIN = f => path.join(__dirname, '..', 'bin', f)
const node = (f, ...a) => execFileSync(process.execPath, [BIN(f), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISCOVERY_ADDONS_OFF: 'all' } })
const jsonl = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))

function app(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-'))
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text) }
  return root
}

test('ids are stable and depend on kind and key only', () => {
  assert.strictEqual(findingId('risk', 'pii-open:X'), findingId('risk', 'pii-open:X'))
  assert.notStrictEqual(findingId('risk', 'a'), findingId('pattern', 'a'))
  assert.match(gapId('authz-unclear', 'S|op'), /^G-authz-unclear-[0-9a-f]{10}$/)
})

test('a measured finding resolves a gap, an AI finding only answers it', () => {
  const B = new Book()
  const f = B.finding({ kind: 'authz', key: 'k', title: 'operation', statement: 'some statement', source: 'test', evidence: ['srv/x.cds:3'] })
  const g1 = B.gap({ kind: 'authz-unclear', key: 'k', about: [f], question: 'allowed?', why: 'inheritance', resolvableBy: ['measured'] })
  const g2 = B.gap({ kind: 'handler-missing', key: 'a', question: 'where?', why: 'not parsed', resolvableBy: ['ai'] })
  B.finding({ kind: 'authz-measured', key: 'k', title: 'measured', statement: 'some statement', source: 'test', method: 'measured', status: 'confirmed', resolves: [g1] })
  B.finding({ kind: 'ai-finding', key: 'a', title: 'found it', statement: 'some statement', source: 'agent:x', method: 'ai', status: 'suspected', resolves: [g2] })
  const { findings, gaps } = B.list()
  assert.strictEqual(gaps.find(g => g.id === g1).status, 'resolved')
  assert.strictEqual(gaps.find(g => g.id === g2).status, 'answered')
  assert.deepStrictEqual(findings.find(x => x.id === f).gaps, [g1])
  for (const x of findings) assert.deepStrictEqual(check('finding', x), [])
  for (const x of gaps) assert.deepStrictEqual(check('gap', x), [])
})

test('the schemas reject what an AI pass must not write', () => {
  assert.ok(check('finding', { id: 'F-x-1', kind: 'risk' }).length)
  const ans = { gap: 'G-handler-missing-0123456789', agent: 'gap-resolver', status: 'answered', answer: 'yes it is', findings: [{ title: 'abc', statement: 'abc', confidence: 'high', evidence: [{ file: 'a.js', line: 1 }] }] }
  assert.ok(check('ai-answer', ans).some(p => /quote/.test(p)), 'evidence without quote is rejected')
  ans.findings[0].evidence[0].quote = 'some verbatim text'
  assert.deepStrictEqual(check('ai-answer', ans), [])
})

test('the evidence gate accepts a quote within two lines and rejects an invented one', () => {
  const root = app({ 'srv/a.js': 'line one\nconst x = req.data.amount\nline three\nline four\nline five\n' })
  assert.strictEqual(checkEvidence(root, 'srv/a.js:4', 'const x = req.data.amount'), null)
  assert.match(checkEvidence(root, 'srv/a.js:5', 'const x = req.data.amount'), /not found/)
  assert.match(checkEvidence(root, { file: 'srv/b.js', line: 1 }, 'whatever text'), /does not exist/)
  assert.match(checkEvidence(root, 'srv/a.js:1', 'short'), /shorter/)
})

test('server.js routes and local plugin code are read (F13, F8)', () => {
  const root = app({
    'package.json': JSON.stringify({ name: 'mono', private: true, workspaces: ['packages/*'] }),
    'packages/srv/package.json': JSON.stringify({ name: 'app', dependencies: { '@sap/cds': '*', 'my-plugin': '*', 'other': 'file:../../libs/other' } }),
    'packages/srv/server.js': "const cds = require('@sap/cds')\ncds.on('bootstrap', (app) => {\n  app.post('/logout', (req, res) => res.sendStatus(401))\n  app.use('/static', express.static('public'))\n})\nmodule.exports = cds.server",
    'packages/plugin/package.json': JSON.stringify({ name: 'my-plugin' }),
    'packages/plugin/cds-plugin.js': "const cds = require('@sap/cds')\ncds.on('served', () => { const s = cds.services.CatalogService; s.before('READ', 'Books', req => {}) })\ncds.once('bootstrap', app => app.get('/health', (req, res) => res.send('ok')))",
    'libs/other/package.json': JSON.stringify({ name: 'other' }),
    'libs/other/cds-plugin.js': "module.exports = {}",
  })
  const { localPlugins } = require('../lib/project/plugins')
  const { extractBootstrap } = require('../lib/extract/bootstrap')
  const srv = path.join(root, 'packages/srv')
  const plugins = localPlugins(srv)
  assert.deepStrictEqual(plugins.map(p => [p.name, p.from]).sort(), [['my-plugin', 'workspace'], ['other', 'file:']])
  const g = new Graph('t')
  const r = extractBootstrap(srv, g)
  const routes = g.byType('HttpRoute').map(n => `${n.props.method} ${n.props.path} ${n.props.kind} ${n.evidence}`).sort()
  assert.deepStrictEqual(routes, ['get /health route ../plugin/cds-plugin.js:3', 'post /logout route server.js:3', 'use /static static server.js:4'])
  assert.strictEqual(r.plugins.length, 2)
  assert.strictEqual(g.nodes.get('plugin:../plugin/cds-plugin.js').props.registers, true)
  assert.strictEqual(g.nodes.get('plugin:../../libs/other/cds-plugin.js').props.registers, false)
})

test('a static run is complete and valid; an AI pass adds only gated findings', { timeout: 240000 }, () => {
  const root = app({
    'package.json': JSON.stringify({ name: 'mini', dependencies: { '@sap/cds': '*' }, cds: { requires: { auth: { kind: 'mocked', users: { alice: { roles: ['admin'] } } } } } }),
    'db/schema.cds': "namespace mini;\nentity Orders {\n  key ID : Integer;\n  status : String(1);\n  amount : Integer;\n}\n",
    'srv/service.cds': "using mini from '../db/schema';\nservice OrderService {\n  @(restrict: [{ grant: '*', to: 'admin' }])\n  entity Orders as projection on mini.Orders actions {\n    action approve();\n    action archive();\n  };\n}\nannotate OrderService.Orders with @(UI.LineItem: [{ Value: status }]);\nannotate OrderService.Orders actions { approve @(Core.OperationAvailable: { $edmJson: { $Ne: [{ $Path: 'in/status' }, 'A'] } }); }\n",
    'srv/service.js': "const cds = require('@sap/cds')\nmodule.exports = class OrderService extends cds.ApplicationService { init() {\n  const { Orders } = this.entities\n  this.on('approve', Orders, req => UPDATE(req.subject).with({ status: 'A' }))\n  return super.init()\n} }\n",
    'server.js': "const cds = require('@sap/cds')\ncds.on('bootstrap', app => app.post('/logout', (req, res) => res.sendStatus(401)))\nmodule.exports = cds.server\n",
  })
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'))
  node('discover.js', root, path.join(out, 'run'))
  node('atlas-facts.js', path.join(out, 'run'), path.join(out, 'atlas-data.json'))
  node('findings.js', out, '--mode', 'static')
  assert.match(node('validate.js', out), /^valid/)
  const F = jsonl(path.join(out, 'run/findings/findings.jsonl')), G = jsonl(path.join(out, 'run/findings/gaps.jsonl'))
  assert.ok(F.every(f => f.method === 'static'))
  const route = F.find(f => f.kind === 'custom-route')
  assert.ok(route && route.evidence[0].file === 'server.js', 'server.js route is a finding')
  const missing = G.find(g => g.kind === 'handler-missing')
  assert.ok(missing && /archive/.test(missing.question), 'archive has no handler: a gap')
  assert.ok(G.some(g => g.kind === 'custom-route-behaviour'))

  // AI pass: requests, one good and one invented finding, gate, merge
  node('ai-requests.js', out)
  const idx = JSON.parse(fs.readFileSync(path.join(out, 'run/ai/requests/index.json'), 'utf8'))
  assert.ok(idx.some(r => r.gap === missing.id))
  assert.ok(fs.readFileSync(path.join(out, 'run/ai/requests', `${missing.id}.md`), 'utf8').includes('action archive();'), 'request carries the code excerpt')
  fs.writeFileSync(path.join(out, 'run/ai/answers', `${missing.id}.json`), JSON.stringify({ gap: missing.id, agent: 'test', status: 'answered', answer: 'Not implemented.', findings: [
    { title: 'archive is declared only', statement: 'No handler; 501.', confidence: 'high', evidence: [{ file: 'srv/service.cds', line: 6, quote: 'action archive();' }] },
    { title: 'invented', statement: 'Does not exist in the code.', confidence: 'low', evidence: [{ file: 'srv/service.js', line: 4, quote: "req.reject(409, 'archived')" }] }] }))
  const merged = node('ai-merge.js', out)
  assert.match(merged, /1 findings accepted, 1 rejected/)
  const F2 = jsonl(path.join(out, 'run/findings/findings.jsonl')), G2 = jsonl(path.join(out, 'run/findings/gaps.jsonl'))
  assert.strictEqual(F2.filter(f => f.method === 'ai').length, 1)
  assert.strictEqual(G2.find(g => g.id === missing.id).status, 'answered')
  assert.match(node('validate.js', out), /^valid/)
  // static mode again: the AI layer stays on disk but out of the findings
  node('findings.js', out, '--mode', 'static')
  assert.ok(jsonl(path.join(out, 'run/findings/findings.jsonl')).every(f => f.method !== 'ai'))
})

test('docs/stages.md is generated from lib/stages.js', () => {
  assert.match(node('stages.js', 'check'), /current/)
})
