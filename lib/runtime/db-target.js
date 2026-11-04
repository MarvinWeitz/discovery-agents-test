// Which database the generated tests run against: the "test" block of discovery.config.json.
// No block (the default): cds.test with in-memory SQLite and the SQLite shim (lib/runtime/sqlite-shim.js), zero
// config. The shim skips HANA-only views so the rest of the model deploys; requests to those views get no test.
// With a block, the app's own CDS profile decides the database, so a team that has a HANA HDI container or a
// Postgres for tests gets every test, HANA-only paths included (docs/test-database.md):
//   profile   CDS profile the tests run with (CDS_ENV), e.g. "hybrid" -> the [hybrid] db of the app (HANA, Postgres)
//   before    npm script of the app (or a shell command) run first: create a throwaway HDI container, start Postgres
//   after     npm script (or command) run at the end, whatever happened: drop the container, stop Postgres
//   deploy    "auto" (default): the toolkit deploys the model itself (cds.deploy, drops and re-creates the tables,
//             loads the CSV data) when the database is not HANA; for HANA your "before" deploys (HDI). true | false
//   auth      "mocked" (default): the tests' mock users, whatever the profile says (xsuaa in hybrid needs tokens).
//             "app": leave the profile's auth as it is
//   url       test over HTTP against an app you start yourself instead of in-process (cds.test does not start it)
//   start     npm script (or command) that starts the app for url mode, in the background; the run waits for url
//   wait      seconds to wait for url to answer (default 180)
// Environment variables win over the file: DISCOVERY_TEST_PROFILE, _BEFORE, _AFTER, _DEPLOY, _AUTH, _URL, _START, _WAIT.
const fs = require('fs')
const path = require('path')
const { spawnSync, spawn } = require('child_process')

const KEYS = ['profile', 'before', 'after', 'deploy', 'auth', 'url', 'start', 'wait']

function testConfig(cfg = require('../config').config()) {
  const t = { ...(cfg.test && typeof cfg.test === 'object' ? cfg.test : {}) }
  for (const k of KEYS) { const v = process.env[`DISCOVERY_TEST_${k.toUpperCase()}`]; if (v !== undefined && v !== '') t[k] = v }
  if (t.deploy === 'true') t.deploy = true
  if (t.deploy === 'false') t.deploy = false
  t.deploy ??= 'auto'
  t.auth ??= 'mocked'
  t.wait = +t.wait || 180
  t.mode = t.url ? 'url' : t.profile ? 'profile' : 'sqlite'
  return t
}

// the database the profile resolves to, read with the app's own @sap/cds: { kind, impl } or { error }
function dbOf(appDir, profile) {
  const code = `const cds = require(require.resolve('@sap/cds', { paths: [process.cwd()] })); cds.root = process.cwd()
    const db = cds.env.requires.db; console.log(JSON.stringify({ kind: db?.kind || null, impl: db?.impl || null, dialect: db?.dialect || null }))`
  const r = spawnSync(process.execPath, ['-e', code], { cwd: appDir, encoding: 'utf8', env: { ...process.env, ...(profile ? { CDS_ENV: profile } : {}) } })
  try { return JSON.parse(String(r.stdout).trim().split('\n').pop()) } catch { return { error: String(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' ').slice(0, 300) } }
}
const isHana = db => /hana/i.test(`${db?.kind} ${db?.impl} ${db?.dialect}`)
const isSqlite = db => !db?.kind || /sqlite|better-sqlite/i.test(`${db.kind} ${db.impl}`)
// the database service package a profile needs, when the app does not have it
const dbPackage = (db, major) => /postgres/i.test(`${db?.kind} ${db?.impl}`) ? '@cap-js/postgres' + (major >= 9 ? '@2' : '@1')
  : isHana(db) ? '@cap-js/hana' + (major >= 9 ? '@2' : '@1') : null

// "before": an npm script of the app when one has that name, else a shell command
function command(appDir, spec) {
  if (!spec) return null
  let scripts = {}
  try { scripts = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).scripts || {} } catch {}
  return scripts[spec] ? `npm run --silent ${JSON.stringify(spec)}` : spec
}

// url mode: start the app in the background (own process group, stopped at the end) and wait until url answers
function startApp(appDir, spec, env, log) {
  const cmd = command(appDir, spec)
  if (!cmd) return null
  log(`$ ${cmd} &`)
  const p = spawn(cmd, { cwd: appDir, env: { ...process.env, ...env }, shell: '/bin/bash', stdio: 'inherit', detached: true })
  p.on('error', e => log(`start failed: ${e.message}`))
  return { stop: () => { try { process.kill(-p.pid, 'SIGTERM') } catch {} }, exited: () => p.exitCode !== null }
}
async function waitFor(url, seconds, app, log) {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) {
    if (app?.exited()) { log('the start command exited before the app answered'); return false }
    try { const r = await fetch(url, { redirect: 'manual' }); if (r.status < 500) return true } catch {}
    await new Promise(r => setTimeout(r, 2000))
  }
  log(`${url} did not answer within ${seconds}s`)
  return false
}

module.exports = { testConfig, dbOf, isHana, isSqlite, dbPackage, command, startApp, waitFor }
