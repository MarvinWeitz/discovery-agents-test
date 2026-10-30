const test = require('node:test')
const assert = require('node:assert')
const rule = require('./max-plus-one-id')
const run = text => rule.detect({ files: [{ path: 'srv/s.ts', text }] })

test('finds max()+1 on CREATE (A8)', () => {
  const hits = run("this.before ('CREATE', Travel, async req => {\n  let { maxID } = await SELECT.one (`max(TravelID) as maxID`) .from (Travel)\n  req.data.TravelID = ++maxID\n})")
  assert.deepStrictEqual(hits.map(h => h.ev), ['srv/s.ts:3'])
})
test('finds the "+ 1" spelling', () => {
  assert.strictEqual(run("srv.before('SAVE', X, async req => {\n const { m } = await SELECT.one(`max(No) as m`).from(X)\n req.data.No = m + 1\n})").length, 1)
})
test('skips per-draft numbering on NEW', () => {
  assert.strictEqual(run("this.before ('NEW', Booking.drafts, async req => {\n  let { maxID } = await SELECT.one (`max(BookingID) as maxID`)\n  req.data.BookingID = ++maxID\n})").length, 0)
})
