#!/usr/bin/env node
// Runs the generated OPA5 journeys in the app, headless:
//   node addons/uitests/run.js <app-out> <app-root> [--url http://localhost:4004] [--port 4004] [--baseline]
// 1. copies <app-out>/run/tests/ui/<app-id>/* to <webapp>/test/discovery/ in the app
// 2. starts the app with `npx cds-serve` (in-memory SQLite, mocked auth), unless --url is given
// 3. opens each test page in Chromium (Playwright), collects every QUnit assertion, and screenshots failures
// 4. writes <app-out>/run/tests/ui/results.json; exits 1 if a generated UI test failed
// --filter <text> runs only the visits whose name contains the text (QUnit filter), e.g. --filter V4.
// --baseline also runs the app's own OPA pages (webapp/test/integration/*.qunit.html), reported apart.
// UI5_CDN_MIRROR=http://host:port serves https://ui5.sap.com/<version>/… from a mirror (offline runs).
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')
const { layout } = require('../../lib/project/layout')

const ROOT = path.join(__dirname, '..', '..')
const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const [out, root] = args.filter((a, i) => !a.startsWith('--') && !['--url', '--port', '--timeout', '--filter', '--user', '--password'].includes(args[i - 1])).map(p => path.resolve(p))
if (!out || !root) { console.error('usage: run.js <app-out> <app-root> [--url url] [--port n] [--baseline]'); process.exit(2) }
const dir = path.join(out, 'run', 'tests', 'ui')
if (!fs.existsSync(path.join(dir, 'plan.json'))) { console.log('[uitests] no UI checks were generated for this app; nothing to run'); process.exit(0) }
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'))
const port = +(opt('--port') || 4004), url = (opt('--url') || `http://localhost:${port}`).replace(/\/$/, '')
const TIMEOUT = +(opt('--timeout') || 900) * 1000
const PW = require('../../lib/resolve').dir('playwright') || 'playwright'

const get = u => new Promise(res => http.get(u, r => { r.resume(); res(r.statusCode) }).on('error', () => res(0)))
const sleep = ms => new Promise(r => setTimeout(r, ms))

// npx starts the server as a child: stop the whole process group
const stop = p => { try { process.kill(-p.pid, 'SIGTERM') } catch { p.kill() } }

async function serve() {
  if (opt('--url')) return null
  if (await get(url + '/')) throw new Error(`port ${port} is already in use; stop that server or pass --url ${url} to test it`)
  const p = spawn('npx', ['cds-serve', '--port', String(port)], { cwd: root, env: { ...process.env, NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let log = ''
  p.stdout.on('data', d => { log += d }); p.stderr.on('data', d => { log += d })
  for (let i = 0; i < 120; i++) { if (await get(url + '/') === 200) return p; if (p.exitCode !== null) break; await sleep(1000) }
  stop(p); throw new Error('the app did not start:\n' + log.slice(-3000))
}

// where the server mounts a UI5 app: cds-plugin-ui5 uses the app id, CAP's static serving the folder under app/
async function mount(app) {
  for (const m of [`/${app.id}`, '/' + path.relative(path.join(root, layout(root).app), path.join(root, app.webapp)).split(path.sep).join('/')])
    if (await get(`${url}${m}/index.html`) === 200) return m
  return null
}

// QUnit collector, injected before any page script runs
const COLLECT = `(() => {
  const R = window.__uit = { done: false, tests: [] }
  const hook = Q => {
    let cur
    Q.testStart(d => { cur = { module: d.module, name: d.name, assertions: [] } })
    Q.log(d => { if (cur) cur.assertions.push({ result: d.result, message: String(d.message || '') + (d.result ? '' : (d.source ? '\\n' + String(d.source).split('\\n').slice(0, 3).join('\\n') : '')) }) })
    Q.testDone(d => { if (!cur) return; cur.failed = d.failed; cur.passed = d.passed; cur.runtime = d.runtime; R.tests.push(cur); if (d.failed && window.__uitShot) window.__uitShot(R.tests.length) })
    Q.done(d => { R.done = true; R.total = d.total; R.failed = d.failed })
  }
  let q
  Object.defineProperty(window, 'QUnit', { configurable: true, get: () => q, set: v => { q = v; try { hook(v) } catch (e) {} } })
})()`

async function runPage(ctx, pageUrl, shots, prefix) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('requestfailed', r => { if (!/sap-ui-cachebuster|\.map$/.test(r.url())) errors.push(`request failed: ${r.method()} ${r.url()} ${r.failure()?.errorText || ''}`) })
  let n = 0
  await page.exposeFunction('__uitShot', async i => {
    if (n++ >= 15) return null
    const f = path.join(shots, `${prefix}-${i}.png`)
    await page.screenshot({ path: f, fullPage: false }).catch(() => null)
    return f
  })
  await page.addInitScript(COLLECT)
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const t0 = Date.now()
  let R
  while (Date.now() - t0 < TIMEOUT) {
    R = await page.evaluate(() => window.__uit).catch(() => null)
    if (R?.done) break
    await sleep(2000)
  }
  await page.close()
  return { url: pageUrl, done: !!R?.done, timedOut: !R?.done, total: R?.total ?? R?.tests?.length ?? 0, failed: R?.failed ?? (R?.tests || []).filter(t => t.failed).length,
    tests: (R?.tests || []).map((t, i) => ({ ...t, screenshot: t.failed && fs.existsSync(path.join(shots, `${prefix}-${i + 1}.png`)) ? path.relative(out, path.join(shots, `${prefix}-${i + 1}.png`)) : null })), errors: errors.slice(0, 10) }
}

async function main() {
  for (const app of plan.apps) {
    const dest = path.join(root, app.webapp, 'test', 'discovery')
    fs.mkdirSync(dest, { recursive: true })
    for (const f of fs.readdirSync(path.join(dir, app.id))) fs.copyFileSync(path.join(dir, app.id, f), path.join(dest, f))
  }
  const server = await serve()
  // never leave the app running, whatever happens below
  process.on('exit', () => server && stop(server))
  const shots = path.join(dir, 'screenshots')
  fs.rmSync(shots, { recursive: true, force: true }); fs.mkdirSync(shots, { recursive: true })
  const { chromium } = require(PW)
  const browser = await chromium.launch()
  const user = { username: opt('--user') || plan.user?.name || 'alice', password: opt('--password') ?? plan.user?.password ?? '' }
  const results = { ran: true, at: new Date().toISOString(), url, user: user.username, apps: [], baseline: [] }
  try {
    const ctx = await browser.newContext({ httpCredentials: user, viewport: { width: 1400, height: 900 } })
    const mirror = process.env.UI5_CDN_MIRROR
    if (mirror) await ctx.route(/^https:\/\/(sap)?ui5\.sap\.com\/(?:[\d.]+\/)?(.*)$/, async r => {
      const m = r.request().url().match(/^https:\/\/(?:sap)?ui5\.sap\.com\/(?:[\d.]+\/)?(.*)$/)
      try { await r.fulfill({ response: await r.fetch({ url: `${mirror.replace(/\/$/, '')}/${m[1]}` }) }) } catch { await r.abort().catch(() => null) }
    })
    for (const app of plan.apps) {
      const m = await mount(app)
      if (!m) { results.apps.push({ id: app.id, error: 'the server does not serve this app (no index.html under the app id or its folder)' }); continue }
      const t = Date.now()
      const r = await runPage(ctx, `${url}${m}/test/discovery/uitests.qunit.html${opt('--filter') ? '?filter=' + encodeURIComponent(opt('--filter')) : ''}`, shots, app.id.replace(/\W/g, '_'))
      results.apps.push({ id: app.id, mount: m, seconds: Math.round((Date.now() - t) / 1000), ...r })
      console.log(`[uitests] ${app.id}: ${r.total - r.failed}/${r.total} assertions passed in ${Math.round((Date.now() - t) / 1000)}s${r.timedOut ? ' (timed out)' : ''}`)
      if (args.includes('--baseline')) {
        const tdir = path.join(root, app.webapp, 'test', 'integration')
        for (const f of fs.existsSync(tdir) ? fs.readdirSync(tdir).filter(f => f.endsWith('.qunit.html')) : []) {
          const b = await runPage(ctx, `${url}${m}/test/integration/${f}`, shots, 'baseline-' + app.id.replace(/\W/g, '_'))
          results.baseline.push({ id: app.id, page: `test/integration/${f}`, ...b })
          console.log(`[uitests] baseline ${app.id} ${f}: ${b.tests.filter(x => !x.failed).length}/${b.tests.length} tests passed${b.timedOut ? ' (timed out)' : ''}`)
        }
      }
    }
  } finally {
    await browser.close()
    if (server) stop(server)
  }
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 1))
  const failed = results.apps.some(a => a.error || a.timedOut || a.failed)
  console.log(`[uitests] results → ${path.join(dir, 'results.json')}${failed ? ' (failures)' : ''}`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1) })
