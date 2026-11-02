const test = require('node:test')
const assert = require('node:assert')
const rule = require('./event-never-emitted')
const { graph, csn } = require('./_fixture')

test('declared event without an emitter', () => {
  const g = graph({ handlers: [['S', 'on', ['approve']]], subscribes: ['S.OrderApproved'] })
  assert.deepStrictEqual(rule.detect({ g, csn }).map(h => h.t), ['S.OrderApproved is declared but never emitted'])
})
test('emitted events, computed names and apps without handlers are fine', () => {
  assert.strictEqual(rule.detect({ g: graph({ emits: [['S', 'S.OrderApproved']] }), csn }).length, 0)
  assert.strictEqual(rule.detect({ g: graph({ handlers: [['S', 'on', ['approve'], { emitsExpr: ['name'] }]] }), csn }).length, 0)
  assert.strictEqual(rule.detect({ g: graph(), csn }).length, 0)
})
