// The "test" block of discovery.config.json (lib/runtime/db-target.js, docs/test-database.md): which database the
// generated tests run against. The end-to-end check against a real Postgres is the CI job in
// .github/workflows/test-database.yml on the synthetic app test/fixtures/db-app.
// Run: node --test test/test-database.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const DB = require('../lib/runtime/db-target')

const clean = () => { for (const k of Object.keys(process.env)) if (k.startsWith('DISCOVERY_TEST_')) delete process.env[k] }

test('no test block: in-memory SQLite with the shim, as before', () => {
  clean()
  const t = DB.testConfig({})
  assert.strictEqual(t.mode, 'sqlite')
  assert.strictEqual(t.deploy, 'auto')
  assert.strictEqual(t.auth, 'mocked')
})

test('profile from the file, environment wins', () => {
  clean()
  assert.strictEqual(DB.testConfig({ test: { profile: 'hybrid', before: 'db:up' } }).mode, 'profile')
  process.env.DISCOVERY_TEST_PROFILE = 'pg'
  process.env.DISCOVERY_TEST_DEPLOY = 'false'
  const t = DB.testConfig({ test: { profile: 'hybrid' } })
  assert.strictEqual(t.profile, 'pg')
  assert.strictEqual(t.deploy, false)
  process.env.DISCOVERY_TEST_URL = 'http://localhost:4004'
  assert.strictEqual(DB.testConfig({}).mode, 'url')
  clean()
})

test('before: an npm script of the app, else a shell command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbt-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { 'test:db': 'docker compose up -d' } }))
  assert.strictEqual(DB.command(dir, 'test:db'), 'npm run --silent "test:db"')
  assert.strictEqual(DB.command(dir, './scripts/hdi-up.sh'), './scripts/hdi-up.sh')
  assert.strictEqual(DB.command(dir, undefined), null)
})

test('database kinds: HANA turns the shim off, Postgres needs its service package', () => {
  assert.ok(DB.isHana({ kind: 'hana' }))
  assert.ok(DB.isHana({ kind: 'db', impl: '@cap-js/hana' }))
  assert.ok(!DB.isHana({ kind: 'postgres' }))
  assert.ok(DB.isSqlite({ kind: 'sqlite' }) && DB.isSqlite(null))
  assert.strictEqual(DB.dbPackage({ kind: 'postgres' }, 9), '@cap-js/postgres@2')
  assert.strictEqual(DB.dbPackage({ kind: 'hana' }, 8), '@cap-js/hana@1')
  assert.strictEqual(DB.dbPackage({ kind: 'sqlite' }, 9), null)
})

test('the test snippet points cds.test at test.url when set', () => {
  const { snippet } = require('../lib/runtime/sqlite-shim')
  const s = snippet({})
  assert.match(s, /DISCOVERY_TEST_URL/)
  assert.match(s, /DISCOVERY_SQLITE_SHIM !== 'off'/)
})
