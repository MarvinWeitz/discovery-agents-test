const test = require('node:test')
const assert = require('node:assert')
const rule = require('./unknown-event')
const { graph, csn } = require('./_fixture')

test('emit of an undeclared event, subscription to a misspelt one', () => {
  const g = graph({ emits: [['S', 'OrderApprovedd']], subscribes: ['S.OrderAproved', 'S.OrderApproved', 'Remote.Changed', 'messaging.topic'] })
  assert.deepStrictEqual(rule.detect({ g, csn }).map(h => h.t), ["emit('OrderApprovedd') on S: event not declared", "Subscription to 'OrderAproved' on S: no such event"])
})
test('declared events are fine', () => {
  assert.strictEqual(rule.detect({ g: graph({ emits: [['S', 'S.OrderApproved']] }), csn }).length, 0)
})
