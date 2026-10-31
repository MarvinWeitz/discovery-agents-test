// coverage addon: requests the recorder logged on draft entities count for the classes' operations
const { test } = require('node:test')
const assert = require('node:assert')
const { measuredRequests } = require('../addons/coverage/coverage')

test('draft events map to the class vocabulary; our own tests are left out', () => {
  const r = measuredRequests([
    { file: 'test/odata.test.ts', entity: 'Travel', event: 'NEW', user: 'amy' },
    { file: 'test/odata.test.ts', entity: 'Travel', event: 'SAVE', user: 'amy' },
    { file: 'test/odata.test.ts', entity: 'Travel', event: 'acceptTravel', user: 'amy' },
    { file: 'test/generated/a.test.js', entity: 'Travel', event: 'READ' },
  ])
  assert.deepEqual(r.map(x => x.op), ['CREATE', 'draftActivate', 'acceptTravel'])
})
