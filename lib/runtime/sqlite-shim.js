// Code that every test file cap-discovery writes into an app starts with (generated tests, the startup check,
// the authorization probe). Two things a real enterprise app needed before cds.test could run at all
// (smart-core review, 2026-11-03):
//   1. HANA-only views on SQLite: a parameterized view (entity X(p: Date) as select ...) cannot be deployed to
//      SQLite, so the whole in-memory deployment failed and no test ran. They are marked
//      @cds.persistence.skip for the test run only: the rest of the model deploys, requests to those views
//      fail (they need HANA anyway, see the hana-only risk). Off: DISCOVERY_SQLITE_SHIM=off.
//      A view that selects from such a view (select from X(p: $now), a projection on it, a join, a union)
//      cannot be compiled for SQLite either once X is skipped ("Invalid navigation ... having annotation
//      @cds.persistence.skip", smart-core run 11), so the skip follows the from-clauses until nothing changes.
//   2. One mock user per role: apps configure two or three mock users, so most roles of xs-security.json
//      were never tested. Synthetic users (discovery-<role>, discovery-norole) are added to the mocked auth
//      users for the test run; the app's own users win on a name clash.
//   3. Messaging without a binding: a messaging service (Event Mesh, a messaging plugin) needs cloud
//      credentials to start, so cds.test stopped at "Missing or malformed credentials" (smart-core run 13).
//      Each required messaging service without credentials runs as local-messaging for the test run: events
//      stay in-process, which is what the tests need. One with credentials stays. Off: DISCOVERY_LOCAL_MESSAGING=off.
// The snippet is plain text so the written test files stay self-contained (they are copied into the app).

// names of the views SQLite cannot hold: parameterized views and every view whose from-clause reaches one.
// With cds given, the SQL compiler then names the rest: a view whose column navigates an association into a
// skipped view (rentAtCurrentDate.freiQuantity, smart-core run 12) fails with "Invalid navigation ... having
// annotation @cds.persistence.skip (in entity:X ...)"; X is skipped too and the compile repeats until it passes
// or fails for another reason (that one the startup check reports). The compiler is the judge, not a guess.
// Self-contained (no closure, no require): its source text is embedded in the generated test files.
function hanaOnlyViews(csn, cds) {
  const defs = csn?.definitions || {}, out = new Set()
  const sources = (q, acc = []) => {
    if (!q || typeof q !== 'object') return acc
    if (Array.isArray(q)) { for (const x of q) sources(x, acc); return acc }
    if (q.SELECT) return sources(q.SELECT.from, acc)
    if (q.SET) return sources(q.SET.args, acc)
    if (q.ref) { const h = q.ref[0]; acc.push(typeof h === 'string' ? h : h?.id) }
    if (q.args) sources(q.args, acc)
    return acc
  }
  const views = Object.entries(defs).filter(([, d]) => d.kind === 'entity' && (d.query || d.projection))
  for (const [n, d] of views) if (d.params) out.add(n)
  for (let grew = true; grew;) {
    grew = false
    for (const [n, d] of views) if (!out.has(n) && sources(d.projection ? { SELECT: d.projection } : d.query).some(s => out.has(s))) { out.add(n); grew = true }
  }
  if (!cds?.compile?.to?.sql || !out.size) return out
  for (let round = 0; round < 25; round++) {
    const copy = JSON.parse(JSON.stringify({ ...csn, definitions: defs }))
    for (const n of out) copy.definitions[n]['@cds.persistence.skip'] = true
    try { cds.compile.to.sql(copy); break } catch (e) {
      const text = [String(e.message || ''), ...(e.messages || []).map(m => String(m) + ' ' + String(m.message || ''))].join('\n')
      const more = [...text.matchAll(/persistence\.skip[^\n]*?\(in entity:\s*[“"]([^”"]+)[”"]/g)].map(m => m[1]).filter(n => defs[n] && !out.has(n))
      if (!more.length) break
      for (const n of more) out.add(n)
    }
  }
  return out
}

// required services that are messaging (their class extends cds.MessagingService, or they look like it by
// name, kind or binding) and have no credentials: switched to local-messaging in place; returns their names.
// Self-contained: its source text is embedded in the generated test files.
function localMessaging(cds) {
  const req = cds.env?.requires || {}, out = []
  const looks = (n, e) => /messag|event-?mesh|kafka|amqp|solace/i.test([n, e.kind, e.impl, e.vcap?.label, e.vcap?.name].filter(x => typeof x === 'string').join(' '))
  for (const [n, e] of Object.entries(req)) {
    if (!e || typeof e !== 'object' || ['kinds', 'db', 'auth', 'queue', 'outbox'].includes(n) || n.startsWith('[')) continue
    if (/^(local-messaging|file-based-messaging)$/.test(e.kind) || /queue|outbox/.test(e.kind || '')) continue
    if (e.credentials && Object.keys(e.credentials).length) continue
    let messaging = false
    try {
      const M = e.impl && require(require.resolve(e.impl, { paths: [cds.root || process.cwd()] }))
      const C = M?.default || M
      messaging = typeof C === 'function' && !!cds.MessagingService && C.prototype instanceof cds.MessagingService
    } catch {}
    if (!messaging && !looks(n, e)) continue
    for (const k of Object.keys(e)) delete e[k]
    Object.assign(e, req.kinds?.['local-messaging'] || {}, { kind: 'local-messaging' })
    out.push(n)
  }
  return out
}

function snippet(users = {}) {
  return `// cap-discovery test setup (lib/runtime/sqlite-shim.js): HANA-only views skipped on SQLite, one mock user per role
;(() => {
  const cds = require('@sap/cds')
  if (global.__discoveryShim) return
  global.__discoveryShim = true
  let model, names = []
  ${hanaOnlyViews.toString()}
  const skip = csn => { for (const n of names) if (csn?.definitions?.[n]) csn.definitions[n]['@cds.persistence.skip'] = true }
  if (process.env.DISCOVERY_SQLITE_SHIM !== 'off') {
    cds.on('loaded', csn => { model = csn; names = [...hanaOnlyViews(csn, cds)]; skip(csn) })
    cds.on('connect', () => skip(model)) // compile steps between load and deploy drop the mark again
  }
  ${localMessaging.toString()}
  if (process.env.DISCOVERY_LOCAL_MESSAGING !== 'off') cds.on('bootstrap', () => {
    const local = localMessaging(cds)
    if (local.length) console.log('[cap-discovery] no credentials, running as local-messaging for the test:', local.join(', '))
  })
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

module.exports = { snippet, syntheticUsers, hanaOnlyViews, localMessaging }
