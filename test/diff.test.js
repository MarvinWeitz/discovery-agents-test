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
