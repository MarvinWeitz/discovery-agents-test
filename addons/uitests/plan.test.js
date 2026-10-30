// node --test addons/uitests/plan.test.js
const test = require('node:test')
const assert = require('node:assert')
const { caseFn, condOf, formOf } = require('./plan')

const enums = { Open: 'O', Accepted: 'A', Canceled: 'X', ReadOnly: 1, Mandatory: 7 }

test('field control case expression is evaluated per status', () => {
  const fn = caseFn(['case', 'when', { ref: ['code'] }, '=', { '#': 'Accepted', val: 'A' }, 'then', { '#': 'ReadOnly', val: 1 }, 'else', { '#': 'Mandatory', val: 7 }, 'end'], enums)
  assert.deepStrictEqual(['O', 'A', 'X'].map(fn), [7, 1, 7])
  assert.strictEqual(caseFn([{ ref: ['code'] }, '=', { val: 'A' }], enums), null)
})

test('hidden condition on the parent status', () => {
  const c = condOf({ xpr: [{ ref: ['to_Travel', 'TravelStatus', 'code'] }, '!=', { '#': 'Open' }] }, enums)
  assert.deepStrictEqual(c.owner, ['to_Travel'])
  assert.strictEqual(c.field, 'TravelStatus')
  assert.deepStrictEqual(['O', 'A', 'X'].map(c.test), [false, true, true])
  assert.strictEqual(condOf(true, enums), null)
})

test('form of a field: section = collection facet, field group = reference facet id', () => {
  const def = {
    '@UI.Facets': [{ ID: 'Booking', Facets: [{ ID: 'FlightData', Target: '@UI.FieldGroup#Flight' }] }, { ID: 'Prices', Target: '@UI.FieldGroup#Prices' }],
    '@UI.FieldGroup#Flight.Data': [{ Value: { '=': 'to_Carrier.AirlineID' } }, { Value: { '=': 'ConnectionID' } }],
    '@UI.FieldGroup#Prices.Data': [{ Value: { '=': 'FlightPrice' } }]
  }
  assert.deepStrictEqual(formOf(def, 'to_Carrier'), { section: 'Booking', fieldGroup: 'FlightData', property: 'to_Carrier_AirlineID' })
  assert.deepStrictEqual(formOf(def, 'FlightPrice'), { section: 'Prices', fieldGroup: 'Prices', property: 'FlightPrice' })
  assert.strictEqual(formOf(def, 'Missing'), null)
})
