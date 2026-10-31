// Rule tests for js.yml in Opengrep's own format: `opengrep scan --test addons/rules/opengrep` (or `semgrep --test`).
// A `ruleid:` comment marks the next line as a required hit, `ok:` as a line that must not hit.
module.exports = srv => {
  srv.before('CREATE', 'Travel', async req => {
    let { maxID } = await SELECT.one(`max(TravelID) as maxID`).from('Travel')
    // ruleid: max-plus-one-id
    req.data.TravelID = ++maxID
  })
  srv.before('NEW', 'Booking.drafts', async req => {
    let { maxID } = await SELECT.one(`max(BookingID) as maxID`).from('Booking.drafts').where(req.data)
    // ok: max-plus-one-id
    req.data.BookingID = ++maxID
  })
  srv.on('deductDiscount', async req => {
    const travel = await SELECT.one.from(req.subject)
    // ruleid: null-deref-in-guard
    if (!travel) throw req.reject(404, `Travel "${travel.ID}" does not exist`)
    // ok: null-deref-in-guard
    if (!travel) { return travel?.ID } else { return travel.ID }
    // ok: null-deref-in-guard
    if (!travel || req.data.force) return travel.ID
  })
  const fees = {
    // ruleid: hard-coded-currency--js
    visitorsFeeCurrency_code: 'EUR',
    // ok: hard-coded-currency--js
    label: 'EUR',
  }
  return fees
}
