// Unit tests for the AI pass on the gaps (bin/ai-pass.js, lib/ai/gate.js): plan hands out each open gap
// once with its prompt, check gates one answer and shows the real lines, the scope rule rejects Java
// evidence, status tracks every request, and every findings rebuild re-gates the answers against the
// current code (an answer whose quote no longer holds drops out).
// Run: node --test 'test/*.test.js'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { gateAnswer } = require('../lib/ai/gate')

const BIN = f => path.join(__dirname, '..', 'bin', f)
const env = { ...process.env, DISCOVERY_ADDONS_OFF: 'all' }
const run = (f, ...a) => { const r = spawnSync(process.execPath, [BIN(f), ...a], { encoding: 'utf8', env }); return { code: r.status, out: r.stdout, err: r.stderr } }
const ok = (f, ...a) => { const r = run(f, ...a); assert.strictEqual(r.code, 0, `${f} ${a.join(' ')}: ${r.err}${r.out}`); return r.out }
const jsonl = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))

function app(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-'))
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text) }
  return root
}

test('gate: schema, gap, quote on its line, scope', () => {
  const root = app({ 'srv/a.js': "line one\nthis.on('x', () => {})\n", 'srv/src/main/java/A.java': 'class A { void check() {} }\n' })
  const gaps = new Map([['G-handler-missing-0123456789', { id: 'G-handler-missing-0123456789', subjects: [], about: [] }]])
  const base = { gap: 'G-handler-missing-0123456789', agent: 'test', status: 'answered', answer: 'yes it is' }
  const f = (file, line, quote) => ({ title: 'a finding', statement: 'says something', confidence: 'low', evidence: [{ file, line, quote }] })
  const g = a => gateAnswer({ a, file: `${a.gap}.json`, gaps, nodes: new Set(), root })
  assert.strictEqual(g({ ...base, findings: [f('srv/a.js', 2, "this.on('x'")] }).accepted.length, 1)
  assert.match(g({ ...base, findings: [f('srv/a.js', 2, 'not in the file')] }).entry.rejected[0].why, /not found near/)
  assert.match(g({ ...base, findings: [f('srv/src/main/java/A.java', 1, 'void check()')] }).entry.rejected[0].why, /out of scope/)
  assert.match(g({ ...base, gap: 'G-handler-missing-ffffffffff', findings: [] }).entry.rejected[0].why, /not in this run/)
  assert.match(g({ ...base, status: 'unknown', findings: [f('srv/a.js', 2, "this.on('x'")] }).entry.rejected[0].why, /empty findings/)
  assert.ok(g({ ...base, findings: 'x' }).entry.rejected.length, 'schema violations are rejected')
})

test('plan, check, merge, status, and re-gating on every rebuild', { timeout: 240000 }, () => {
  const root = app({
    'package.json': JSON.stringify({ name: 'mini', dependencies: { '@sap/cds': '*' }, cds: { requires: { auth: { kind: 'mocked', users: { alice: { roles: ['admin'] } } } } } }),
    'db/schema.cds': 'namespace mini;\nentity Orders {\n  key ID : Integer;\n  status : String(1);\n}\n',
    'srv/service.cds': "using mini from '../db/schema';\nservice OrderService {\n  @(restrict: [{ grant: '*', to: 'admin' }])\n  entity Orders as projection on mini.Orders actions {\n    action approve();\n    action archive();\n  };\n}\n",
    'srv/service.js': "const cds = require('@sap/cds')\nmodule.exports = class OrderService extends cds.ApplicationService { init() {\n  const { Orders } = this.entities\n  this.on('approve', Orders, req => UPDATE(req.subject).with({ status: 'A' }))\n  return super.init()\n} }\n",
  })
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'))
  ok('discover.js', root, path.join(out, 'run'))
  ok('atlas-facts.js', path.join(out, 'run'), path.join(out, 'atlas-data.json'))
  ok('findings.js', out, '--mode', 'static')

  // plan works on a static run: it writes the requests itself
  const P = JSON.parse(ok('ai-pass.js', 'plan', out))
  const item = P.items.find(i => i.kind === 'handler-missing')
  assert.ok(item, 'the missing archive handler is handed out')
  assert.ok(fs.existsSync(item.request))
  assert.ok(item.prompt.includes(item.answer) && item.prompt.includes(root), 'prompt names the answer file and the app root')
  assert.strictEqual(JSON.parse(ok('ai-pass.js', 'plan', out, '--limit', '1')).items.length, 1)

  // check: one bad quote is shown against the real lines, exit 1; fixed, exit 0
  const write = quote => fs.writeFileSync(item.answer, JSON.stringify({ gap: item.gap, agent: 'test', status: 'answered', answer: 'Not implemented.', findings: [{ title: 'archive is declared only', statement: 'No handler; 501.', confidence: 'high', evidence: [{ file: 'srv/service.cds', line: 6, quote }] }] }))
  write('action archived();')
  const bad = run('ai-pass.js', 'check', out, item.gap)
  assert.strictEqual(bad.code, 1)
  assert.match(bad.out, /REJECTED/)
  assert.match(bad.out, /6 +action archive\(\);/, 'shows the real line')
  write('action archive();')
  assert.strictEqual(run('ai-pass.js', 'check', out, item.gap).code, 0)

  // answered, not merged yet; plan no longer hands it out
  assert.match(ok('ai-pass.js', 'status', out), /1 answered, not merged yet/)
  assert.ok(!JSON.parse(ok('ai-pass.js', 'plan', out)).items.some(i => i.gap === item.gap))

  // merge: gap answered, manifest records who answered and the gate
  assert.match(ok('ai-merge.js', out), /1 findings accepted, 0 rejected/)
  const G = jsonl(path.join(out, 'run/findings/gaps.jsonl'))
  assert.strictEqual(G.find(g => g.id === item.gap).status, 'answered')
  const M = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'))
  assert.match(M.stages.find(s => s.id === 'ai-answer').said, /1 answers by test/)
  assert.strictEqual(M.stages.find(s => s.id === 'ai-merge').status, 'ran')
  const S = JSON.parse(ok('ai-pass.js', 'status', out, '--json'))
  assert.strictEqual(S.rows.find(r => r.gap === item.gap).state, 'accepted')

  // the code changes under the answer: the next rebuild in mode static+ai drops it, the gap reopens
  fs.writeFileSync(path.join(root, 'srv/service.cds'), fs.readFileSync(path.join(root, 'srv/service.cds'), 'utf8').replace('    action archive();\n', '    action archive(); // to do\n    action purge();\n'))
  fs.writeFileSync(path.join(root, 'srv/service.cds'), fs.readFileSync(path.join(root, 'srv/service.cds'), 'utf8').replace('  entity Orders', '  // orders\n  // are\n  // kept\n  // here\n  entity Orders'))
  ok('findings.js', out, '--mode', 'static+ai')
  const G2 = jsonl(path.join(out, 'run/findings/gaps.jsonl'))
  assert.notStrictEqual(G2.find(g => g.id === item.gap)?.status, 'answered', 'a quote that moved away no longer answers the gap')
  assert.strictEqual(jsonl(path.join(out, 'run/findings/findings.jsonl')).filter(f => f.method === 'ai').length, 0)
  assert.match(ok('validate.js', out), /^valid/)
})
