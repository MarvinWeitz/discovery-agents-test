// addon diff: a rule whose content changes but whose id (file:line) stays is a change, and its class keeps its test
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), os = require('os'), path = require('path')
const { diff } = require('../addons/diff/diff')

function run(props, st) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-'))
  fs.mkdirSync(path.join(d, 'run', 'graph'), { recursive: true })
  fs.writeFileSync(path.join(d, 'run', 'graph', 'nodes.jsonl'), JSON.stringify({ id: 'rule:srv/a.js:36', type: 'Rule', props }) + '\n')
  fs.writeFileSync(path.join(d, 'run', 'graph', 'edges.jsonl'), '')
  fs.writeFileSync(path.join(d, 'atlas-data.json'), JSON.stringify({ COVERAGE: { pct: 50, classes: [{ id: 'RUL:rule:srv/a.js:36:t', st, name: 'r', cat: 'Handler rules' }] } }))
  return d
}

test('same rule id with new props: changed, class not lost', () => {
  const d = diff(run({ kind: 'rejection' }, 'tested'), run({ kind: 'rejection', conds: [{ lhs: 'x' }] }, 'tested'))
  assert.equal(d.graph.added.length, 0)
  assert.equal(d.graph.removed.length, 0)
  assert.deepEqual(d.graph.changed.map(c => c.keys), [['conds']])
  assert.equal(d.classes.removed.length, 0)
  assert.equal(d.classes.lost.length, 0)
})

test('rule moved to another line with the same content: still matched', () => {
  const a = run({ kind: 'rejection' }, 'tested'), b = run({ kind: 'rejection' }, 'tested')
  fs.writeFileSync(path.join(b, 'run', 'graph', 'nodes.jsonl'), JSON.stringify({ id: 'rule:srv/a.js:40', type: 'Rule', props: { kind: 'rejection' } }) + '\n')
  const d = diff(a, b)
  assert.equal(d.graph.removed.length, 0)
  assert.deepEqual(d.graph.moved, [{ from: 'rule:srv/a.js:36', to: 'rule:srv/a.js:40' }])
})

// review brief: a reworded rejection reaches its handler's entity, the test that calls it, and shows as a message change
test('brief: tests to run and messages users see', () => {
  const mk = msg => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'))
    fs.mkdirSync(path.join(d, 'run', 'graph'), { recursive: true }); fs.mkdirSync(path.join(d, 'run', 'tests', 'generated'), { recursive: true })
    const nodes = [
      { id: 'entity:mini.Orders', type: 'Entity', props: { name: 'mini.Orders' } },
      { id: 'svcentity:S.Orders', type: 'ServiceEntity', props: { name: 'S.Orders' } },
      { id: 'svcentity:S.Items', type: 'ServiceEntity', props: { name: 'S.Items' } },
      { id: 'handler:srv/a.js:3', type: 'Handler', props: { phase: 'before', events: ['UPDATE'] }, evidence: 'srv/a.js:3' },
      { id: 'rule:srv/a.js:4', type: 'Rule', props: { kind: 'rejection', status: 400, message: msg }, evidence: 'srv/a.js:4' },
      { id: 'test:test/orders.test.js', type: 'ExistingTest', props: {} },
      { id: 'test:test/items.test.js', type: 'ExistingTest', props: {} },
    ]
    const edges = [['svcentity:S.Orders', 'projects_on', 'entity:mini.Orders'], ['handler:srv/a.js:3', 'handles', 'svcentity:S.Orders'], ['handler:srv/a.js:3', 'enforces', 'rule:srv/a.js:4'],
      ['test:test/orders.test.js', 'mentions', 'svcentity:S.Orders'], ['test:test/items.test.js', 'mentions', 'svcentity:S.Items']].map(([from, rel, to]) => ({ from, rel, to, props: {} }))
    fs.writeFileSync(path.join(d, 'run', 'graph', 'nodes.jsonl'), nodes.map(n => JSON.stringify(n)).join('\n') + '\n')
    fs.writeFileSync(path.join(d, 'run', 'graph', 'edges.jsonl'), edges.map(n => JSON.stringify(n)).join('\n') + '\n')
    fs.writeFileSync(path.join(d, 'run', 'tests', 'generated', 'manifest.json'), JSON.stringify({ tests: [{ file: 'auth.test.js', cls: 'AUT:Orders UPDATE', title: 'PATCH /Orders' }, { file: 'auth.test.js', cls: 'AUT:Items READ', title: 'GET /Items' }] }))
    fs.writeFileSync(path.join(d, 'atlas-data.json'), '{}')
    return d
  }
  const { diffWithBrief } = require('../addons/diff/diff')
  const { render } = require('../addons/diff/report')
  const b = mk('negative'), h = mk('Amount must not be negative.')
  const d = diffWithBrief(b, h)
  assert.deepEqual(d.brief.existing.map(x => x.file), ['test/orders.test.js'], 'only the test that calls the changed entity')
  assert.deepEqual(d.brief.generated.map(x => [x.file, x.n]), [['auth.test.js', 1]])
  assert.deepEqual(d.brief.messages.map(m => [m.change, m.was, m.text]), [['reworded', 'negative', 'Amount must not be negative.']])
  const md = render(d).md
  assert.match(md, /### 🧪 Tests to run[\s\S]*test\/orders\.test\.js[\s\S]*### 💬 Messages users see[\s\S]*~~negative~~ → Amount/)
  assert.ok(!diffWithBrief(b, b).brief.entities.length, 'no change, no brief')
})
