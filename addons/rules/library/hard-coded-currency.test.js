const test = require('node:test')
const assert = require('node:assert')
const rule = require('./hard-coded-currency')
const run = text => rule.detect({ files: [{ path: 'srv/a.cds', text }] })

test('finds a literal currency in a projection (A12)', () => {
  assert.deepStrictEqual(run("entity B as select from X {\n  FlightPrice,\n  'USD' as CurrencyCode_code : String(3),\n}").map(h => h.ev), ['srv/a.cds:3'])
})
test('ignores defaults, comments and labels', () => {
  assert.strictEqual(run("Currency : String default 'EUR';\n// 'USD' as CurrencyCode_code\n@title: 'USD'").length, 0)
})
