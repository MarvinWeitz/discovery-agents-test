// Conditions read by parsers, not text: CAP's expression parser for CQL, the TypeScript syntax tree for JS guards.
const test = require('node:test')
const assert = require('node:assert')
const { cqlComparisons, cxnComparisons } = require('../lib/analyse/conditions')

test('where-clause through cds.parse.expr', () => {
  assert.deepStrictEqual(cqlComparisons("TravelStatus.code != 'A' and BookingFee != null").map(c => [c.lhs, c.op, c.rhs, c.literal]),
    [['TravelStatus.code', '!=', 'A', true], ['BookingFee', '!=', null, true]])
  assert.deepStrictEqual(cqlComparisons('stock >= ${quantity}').map(c => [c.lhs, c.op, c.literal]), [['stock', '>=', false]])
  assert.strictEqual(cqlComparisons('{ ID: x }'), null)
})

test('annotation CXN with an enum symbol, and `not` flips the operator', () => {
  const [c] = cxnComparisons([{ ref: ['$self', 'TravelStatus', 'code'] }, '!=', { '#': 'Accepted', val: 'A' }])
  assert.deepStrictEqual([c.op, c.rhs, c.symbol], ['!=', 'A', 'Accepted'])
  assert.strictEqual(cxnComparisons(['not', { ref: ['x'] }, '=', { val: 1 }])[0].op, '!=')
})
