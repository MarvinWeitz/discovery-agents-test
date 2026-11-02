const test = require('node:test')
const assert = require('node:assert')
const rule = require('./orphan-handler')
const { graph, csn } = require('./_fixture')

test('a handler for an undeclared action', () => {
  const g = graph({ handlers: [['S', 'on', ['cancel'], { target: 'S.Orders' }], ['S', 'on', ['approve']], ['S', 'before', ['CREATE', 'UPDATE']], ['S', 'on', ['OrderApproved']], ['S', 'after', ['each']]] })
  assert.deepStrictEqual(rule.detect({ g, csn }).map(h => h.t), ["on('cancel') on S: no such action, function or event"])
})
test('events from expressions, remote services and unknown services are skipped', () => {
  const g = graph({ handlers: [['S', 'on', ['action'], { exprEvents: ['action'] }], ['Remote', 'on', ['whatever']], [null, 'on', ['x']]] })
  assert.strictEqual(rule.detect({ g, csn }).length, 0)
})
