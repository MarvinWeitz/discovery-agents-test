// A big app must stay readable and testable: the synthetic app in test/fixtures/scale-app.js carries the shapes
// that made a real enterprise app noisy or unrunnable (smart-core review, 2026-11-03), and this test pins the
// bounds that came out of the fixes. Static part: always. Runtime part (the generated tests boot the app on
// SQLite and run): only when stress/node_modules has @sap/cds and @cap-js/sqlite (stress.yml installs them).
// Run: node --test test/scale.test.js
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { scaleApp } = require('./fixtures/scale-app')

const ROOT = path.join(__dirname, '..')
const app = path.join(ROOT, 'stress', `.scale-test-${process.pid}`) // under stress/ so its node_modules resolve
const out = path.join(require('os').tmpdir(), `scale-out-${process.pid}`)
const read = f => fs.readFileSync(path.join(out, f), 'utf8')
const json = f => JSON.parse(read(f))
const jsonl = f => read(f).split('\n').filter(Boolean).map(l => JSON.parse(l))

test.before(() => {
  scaleApp(app)
  execFileSync(process.execPath, [path.join(ROOT, 'bin', 'pipeline.js'), app, out], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DISCOVERY_IMAGES: 'off' }, timeout: 600000 })
})
test.after(() => { fs.rmSync(app, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }) })

test('risks: one row-level risk per service, not one per grant', () => {
  const D = json('atlas-data.json'), rl = D.RISKS.filter(r => r.key.startsWith('row-level:'))
  assert.ok(rl.length <= 12, `${rl.length} row-level risks`)
  assert.ok(rl.every(r => r.count >= 1))
  assert.ok(D.RISKS.length < 40, `${D.RISKS.length} risks`)
})

test('slices: one per domain entity, not one per service projection', () => {
  const c = json('run/slices/catalog.json'), S = c.slices || c
  assert.ok(S.length <= 70, `${S.length} slices`) // 60 domain entities + Orders + a few; was 184
  assert.ok(S.some(s => (s.seeds || []).length >= 3), 'an entity projected into 3 services is one slice')
  assert.ok(Math.max(...S.map(s => s.members.length)) < 120, 'associations stop at another slice\'s entity')
})

test('gaps: slice reviews for the riskiest 20 only, criticality once per service', () => {
  const G = jsonl('run/findings/gaps.jsonl'), n = k => G.filter(g => g.kind === k).length
  assert.ok(n('slice-review') <= 20)
  assert.strictEqual(n('business-criticality'), 12)
  assert.ok(n('authz-unclear') < 20, `${n('authz-unclear')} authz-unclear gaps (own-rows grants are no open question)`)
})

test('next steps: grouped, and the Markdown lists the top 25', () => {
  const D = json('atlas/atlas-data.json')
  assert.ok(D.NEXT.items.length < 120, `${D.NEXT.items.length} next steps`)
  const md = fs.readdirSync(path.join(out, 'atlas', 'topics')).find(f => f.includes('nxt'))
  const rows = read(`atlas/topics/${md}`).split('\n').filter(l => /^\| P\d /.test(l))
  assert.ok(rows.length <= 25, `${rows.length} rows in the NXT table`)
})

test('page and Markdown stay small', () => {
  assert.ok(fs.statSync(path.join(out, 'atlas', 'index.html')).size < 1.6e6)
  for (const f of fs.readdirSync(path.join(out, 'atlas', 'topics'))) assert.ok(fs.statSync(path.join(out, 'atlas', 'topics', f)).size < 120000, f)
})

test('detectors: the status lifecycle, PII names, in-process events', () => {
  const D = json('atlas-data.json')
  assert.strictEqual(D.STATES.field, 'status_code', 'a code-list status beats a boolean feature flag')
  assert.ok(D.STATES.others.some(o => /isFeatureFlag/.test(o.field)))
  const pii = D.ENT.filter(e => e[4]).map(e => e[0])
  assert.strictEqual(new Set(pii).size, pii.length, `PII names unique: ${pii}`)
  const hits = Object.fromEntries((D.RULES?.rules || []).map(r => [r.key, r.hits.length]))
  assert.strictEqual(hits['unknown-event'], 0, 'emit + own srv.on is no unknown event')
  assert.strictEqual(hits['orphan-handler'], 0, 'nor an orphan handler')
  assert.ok(D.PATTERNS.some(p => /In-process async event/.test(p.n)))
  assert.ok(!(D.RULES?.rules || []).some(r => r.error), 'no rule crashed')
})

test('tests: one mock user per role and the SQLite setup in every generated file', () => {
  const m = json('run/tests/generated/manifest.json')
  assert.ok(m.users.includes('discovery-Role15'), m.users.join(','))
  const D = json('atlas-data.json')
  // every role of xs-security.json has a user in the matrix (alice and bob hold Role01 and Role02, 13 are added)
  for (let i = 1; i <= 15; i++) { const r = `Role${String(i).padStart(2, '0')}`; assert.ok(D.ROLES.some(x => x[1].includes(r)), r) }
  // a view on a view on the parameterized view is HANA-only too, so is a view navigating an association into one; (requests to it get no generated test)
  assert.ok(!jsonl('run/graph/nodes.jsonl').find(n => n.id.endsWith('core.Holders'))?.props?.hanaOnly, 'the plain entity with the association stays')
  const hana = jsonl('run/graph/nodes.jsonl').filter(n => n.props?.hanaOnly).map(n => n.id)
  for (const v of ['StockAtDates', 'StockAtToday', 'StockSummary', 'Svc00.StockToday', 'Svc00.HolderStock']) assert.ok(hana.some(id => id.endsWith(v)), `${v} not HANA-only: ${hana}`)
  for (const f of fs.readdirSync(path.join(out, 'run', 'tests', 'generated')).filter(f => f.endsWith('.test.js')))
    assert.match(read(`run/tests/generated/${f}`), /@cds\.persistence\.skip/)
})

const runtime = ['@sap/cds', '@cap-js/sqlite'].every(p => fs.existsSync(path.join(ROOT, 'stress', 'node_modules', p, 'package.json')))
test('runtime: the app with a parameterized view boots on SQLite and the generated tests pass', { skip: !runtime && 'stress/node_modules not installed (cd stress && npm ci)' }, () => {
  const dir = path.join(app, 'test', 'generated')
  fs.mkdirSync(dir, { recursive: true })
  const files = fs.readdirSync(path.join(out, 'run', 'tests', 'generated')).filter(f => f.endsWith('.test.js'))
  for (const f of files) fs.copyFileSync(path.join(out, 'run', 'tests', 'generated', f), path.join(dir, f))
  const r = spawnSync(process.execPath, ['--test', ...files.map(f => path.join('test', 'generated', f))], { cwd: app, encoding: 'utf8', timeout: 600000, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) })
  const n = k => +(r.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1]
  assert.ok(n('pass') > 100, `passed ${n('pass')}\n${r.stdout.slice(-2000)}`)
  assert.strictEqual(n('fail'), 0, r.stdout.split('\n').filter(l => /not ok|Error/.test(l)).slice(0, 10).join('\n'))
})
