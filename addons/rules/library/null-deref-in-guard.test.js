const test = require('node:test')
const assert = require('node:assert')
const rule = require('./null-deref-in-guard')
const run = text => rule.detect({ files: [{ path: 'srv/s.ts', text }] })

test('finds the deductDiscount shape (A7)', () => {
  const hits = run(`this.on('x', async req => {\n  const travel = await SELECT.one.from(T)\n  if (!travel) throw req.reject(404, \`Travel "\${travel.ID}" does not exist\`)\n})`)
  assert.deepStrictEqual(hits.map(h => h.ev), ['srv/s.ts:3'])
})
test('finds it inside a combined guard', () => {
  assert.strictEqual(run('if (!ok && !t) { log(t.name) }').length, 1)
})
test('ignores a correct error path and optional chaining', () => {
  assert.strictEqual(run('if (!t) throw req.reject(404, `Travel ${id} does not exist`)\nif (!t) log(t?.name)').length, 0)
})
