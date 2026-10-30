const test = require('node:test')
const assert = require('node:assert')
const rule = require('./commented-out-grant')
const run = text => rule.detect({ files: [{ path: 'srv/s.cds', text }] })

test('finds a privilege commented out in a grant list (event app A2)', () => {
  const hits = run("entity P @(restrict: [{\n  grant: [\n    'CREATE',\n    // 'UPDATE', // FIXME: needed but too wide\n  ], to: 'Employee' }])")
  assert.deepStrictEqual(hits.map(h => h.ev), ['srv/s.cds:4'])
  assert.match(hits[0].d, /FIXME/)
})
test('reports a commented-out @restrict block once (SFlight A3)', () => {
  const hits = run("service A {\n  // @(restrict: [\n  //   { grant: 'READ', to: 'authenticated-user'},\n  // ])\n  entity B as projection on X;\n}")
  assert.deepStrictEqual(hits.map(h => h.ev), ['srv/s.cds:2'])
})
test('ignores ordinary comments', () => {
  assert.strictEqual(run("// read-only list of airports\nentity A as projection on X; // READ only").length, 0)
})
