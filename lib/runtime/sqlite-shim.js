// Code that every test file cap-discovery writes into an app starts with (generated tests, the startup check,
// the authorization probe). Two things a real enterprise app needed before cds.test could run at all
// (smart-core review, 2026-11-03):
//   1. HANA-only views on SQLite: a parameterized view (entity X(p: Date) as select ...) cannot be deployed to
//      SQLite, so the whole in-memory deployment failed and no test ran. They are marked
//      @cds.persistence.skip for the test run only: the rest of the model deploys, requests to those views
//      fail (they need HANA anyway, see the hana-only risk). Off: DISCOVERY_SQLITE_SHIM=off.
//   2. One mock user per role: apps configure two or three mock users, so most roles of xs-security.json
//      were never tested. Synthetic users (discovery-<role>, discovery-norole) are added to the mocked auth
//      users for the test run; the app's own users win on a name clash.
// The snippet is plain text so the written test files stay self-contained (they are copied into the app).

function snippet(users = {}) {
  return `// cap-discovery test setup (lib/runtime/sqlite-shim.js): HANA-only views skipped on SQLite, one mock user per role
;(() => {
  const cds = require('@sap/cds')
  if (global.__discoveryShim) return
  global.__discoveryShim = true
  let model
  const skip = csn => { for (const d of Object.values(csn?.definitions || {})) if (d.params && (d.query || d.projection) && !d['@cds.persistence.skip']) d['@cds.persistence.skip'] = true }
  if (process.env.DISCOVERY_SQLITE_SHIM !== 'off') {
    cds.on('loaded', csn => { model = csn; skip(csn) })
    cds.on('connect', () => skip(model)) // compile steps between load and deploy drop the mark again
  }
  const users = ${JSON.stringify(users)}
  if (Object.keys(users).length) cds.on('bootstrap', () => {
    const auth = cds.env.requires?.auth
    if (auth && ['mocked', 'basic', 'dummy'].includes(auth.kind)) auth.users = { ...users, ...(auth.users || {}) }
  })
})()
`
}

// mock users for the roles no configured mock user holds: { name: { password: '', roles: [role] } }
function syntheticUsers(td) {
  const out = {}
  for (const u of td?.auth?.users || []) if (u.synthetic) out[u.id] = { password: '', roles: u.roles }
  return out
}

module.exports = { snippet, syntheticUsers }
