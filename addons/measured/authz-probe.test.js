// Written by the Run discovery workflow into the app's test folder: asks the running app who may do what.
// For every row of the static authorization matrix (plan.json from the pipeline) and every user, one
// request: CAP's own auth handlers decide. 401/403 = denied, 405 = not allowed by Capabilities, anything
// else (2xx, 400 validation, 404, 409 ...) = got past authorization. The answers go to
// $DISCOVERY_MEASURE_OUT/authz.json. Never fails: a measurement, not a check.
// Walkthrough: docs/walkthrough/07-authz.md
const fs = require('fs')
const path = require('path')
const T = typeof globalThis.it === 'function' ? globalThis : require('node:test')
const out = process.env.DISCOVERY_MEASURE_OUT
const plan = (() => { try { return JSON.parse(fs.readFileSync(path.join(out, 'plan.json'), 'utf8')) } catch { return null } })()
const cds = require(require.resolve('@sap/cds', { paths: [process.cwd()] }))
try { require(path.join(__dirname, 'recorder.js')) } catch {}
const test = cds.test(path.resolve(__dirname, '../..'), '--with-mocks')

const verdict = s => s === 401 || s === 403 ? 'n' : s === 405 ? 'n405' : s ? 'y' : 'error'

const underJest = typeof globalThis.it === 'function'
const it = (name, fn) => underJest ? T.it(name, fn, 600000) : T.it(name, { timeout: 600000 }, fn)
T.describe('discovery: authorization probe', () => {
  it('sends every planned request as every user', async () => {
    if (!plan) return
    const users = cds.env.requires?.auth?.users || {}
    const results = []
    const send = async (p, u) => {
      const auth = u === 'anonymous' ? undefined : { username: u, password: users[u]?.password ?? '' }
      try {
        const res = await test.axios.request({ method: p.method, url: p.url, data: p.body, auth, validateStatus: () => true, headers: p.body ? { 'content-type': 'application/json' } : {} })
        return res.status
      } catch (e) { return e.response?.status || null }
    }
    // destructive requests last, so earlier rows still find their record
    const order = { GET: 0, POST: 1, PATCH: 2, DELETE: 3 }
    for (const p of [...plan.requests].sort((a, b) => (order[a.method] ?? 1) - (order[b.method] ?? 1))) {
      const cells = []
      for (const u of plan.users) { const status = await send(p, u); cells.push({ user: u, status, v: verdict(status) }) }
      results.push({ row: p.row, op: p.op, method: p.method, url: p.url, cells })
    }
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'authz.json'), JSON.stringify({ cds: cds.version, users: plan.users, results }, null, 1))
  })
})
