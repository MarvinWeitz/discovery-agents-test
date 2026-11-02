#!/usr/bin/env node
// Stress corpus: plants known bugs in small valid apps and measures which checks of the toolkit find them.
//   node stress/bin/stress.js run [filter] [--jobs 3] [--no-validate] [--no-negative]
//   node stress/bin/stress.js list
//   node stress/bin/stress.js report          (re-render SCORECARD.md and the chart from report/results.json)
// A case is a clean base app (stress/apps/<base>, a control: every alarm on it is a false positive) or a
// seed (stress/seeds/*.js: base + edits + the checks that must fire). Each case is proven valid first
// (lib/validate.js), then discovered with the toolkit (discover, facts, findings; no images, no atlas),
// then compared with its base (lib/score.js). Results: stress/report/results.json, SCORECARD.md, scorecard.svg.
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { STRESS, materialize, loadSeeds, bases, baseConf } = require('../lib/case')
const { validate, nodeTest } = require('../lib/validate')
const { readRun, compare, controlAlarms } = require('../lib/score')
const { render } = require('../lib/render')

const args = process.argv.slice(2)
// --toolkit <dir>: score another checkout of the toolkit (e.g. main, for a before/after table); --report <dir>
const argv = k => { const i = args.indexOf(k); return i >= 0 ? path.resolve(args[i + 1]) : null }
const TOOLKIT = argv('--toolkit') || path.join(STRESS, '..')
const REPORT = argv('--report') || path.join(STRESS, 'report')
const cmd = args[0] || 'run'
const flag = f => args.includes(f)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const filter = args.slice(1).find((a, i, all) => !a.startsWith('--') && !['--jobs', '--toolkit', '--report'].includes(all[i - 1])) || null

const PRE = `const cds = require('@sap/cds')
const { test } = require('node:test')
const assert = require('node:assert')
const { GET, POST, PATCH, PUT, DELETE, axios } = cds.test(__dirname + '/..')
axios.defaults.validateStatus = () => true
const as = user => ({ auth: { username: user, password: '' } })
`
const SMOKE = `${PRE}test('the server boots and serves', async () => { const r = await GET('/'); assert.ok(r.status < 500, 'status ' + r.status) })\n`
const proofName = seed => `zz-proof.test.${seed.proofExt || 'js'}`
const proofEdit = (seed) => ({ file: `${seed.proofDir ? seed.proofDir + '/' : ''}test/${proofName(seed)}`, write: seed.proof ? `${PRE}\n${seed.proof}\n` : SMOKE })

function node(script, a, env = {}) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(TOOLKIT, 'bin', script), ...a], { cwd: TOOLKIT, env: { ...process.env, DISCOVERY_IMAGES: 'off', DISCOVERY_OPENGREP: process.env.DISCOVERY_OPENGREP || 'off', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
    p.on('close', code => resolve({ code, out }))
  })
}

async function discover(c, conf) {
  const run = path.join(c.out, 'run')
  const steps = [['discover.js', [c.root, run, ...(conf.ui ? ['--ui', conf.ui] : [])]], ['atlas-facts.js', [run, path.join(c.out, 'atlas-data.json')]], ['findings.js', [c.out, '--mode', 'static']]]
  for (const [s, a] of steps) {
    const r = await node(s, a)
    if (r.code !== 0) return { ok: false, step: s, log: r.out.trim().split('\n').slice(-8).join('\n') }
  }
  return { ok: true }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
  return out
}

async function runAll() {
  const jobs = +opt('--jobs', 3), doValidate = !flag('--no-validate'), negative = !flag('--no-negative')
  const seeds = loadSeeds().filter(s => !filter || s.id.includes(filter) || s.base.includes(filter) || s.group.includes(filter))
  const baseIds = [...new Set(bases().filter(b => !filter || seeds.some(s => s.base === b) || b.includes(filter)))]
  const t0 = Date.now()
  const log = (...m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...m)

  // 1. bases (controls)
  const B = {}
  await pool(baseIds, jobs, async b => {
    const conf = baseConf(b)
    const c = materialize(`base-${b}`, b, [], [{ file: 'test/zz-proof-smoke.test.js', write: SMOKE }])
    const v = doValidate ? await validate(c.root, conf) : null
    const d = await discover(c, conf)
    const run = d.ok ? readRun(c.out) : null
    B[b] = { base: b, title: conf.title, control: conf.control !== false, valid: v, discover: d, run, alarms: run ? controlAlarms(run, conf.accepted) : [], findings: run?.findings.length || 0 }
    log(`base ${b}: valid=${v ? v.ok : 'skipped'} discover=${d.ok} alarms=${B[b].alarms.filter(a => !a.accepted).length}`)
  })

  // 2. seeds
  const S = await pool(seeds, jobs, async s => {
    const conf = baseConf(s.base)
    let c
    try { c = materialize(s.id, s.base, s.edits, [proofEdit(s)]) } catch (e) { log(`seed ${s.id}: edits failed: ${e.message}`); return { ...meta(s), error: e.message } }
    const v = doValidate ? await validate(s.proofDir ? path.join(c.root, s.proofDir) : c.root, { ...conf, ...(s.ui5 ? { ui5: s.ui5 } : {}) }, { proof: proofName(s), all: !s.expect?.length }) : null
    // the proof must fail on the clean base: otherwise it does not show the seeded bug
    let neg = null
    if (doValidate && negative && s.proof && !s.probe && s.expect?.length) {
      const nb = materialize(`${s.id}-negative`, s.base, [], [proofEdit(s)])
      const r = await nodeTest(nb.root, [`test/${proofName(s)}`])
      neg = { failsOnBase: !r.ok }
      fs.rmSync(nb.dir, { recursive: true, force: true })
    }
    // detect: the seed tests the intake (lib/project/detect.js, what cap-discovery and the workflow use) on an odd layout
    let det = null
    if (s.detect) { det = await require('../../lib/project/detect').detect(c.root, { curatedDir: path.join(TOOLKIT, 'curated') }); c.root = path.join(c.root, det.app) }
    const d = await discover(c, { ...conf, ...(s.uiArg ? { ui: s.uiArg } : det ? { ui: det.ui || undefined } : {}) })
    const base = B[s.base]
    const cmp = d.ok && base?.run ? compare(base.run, readRun(c.out), s) : null
    log(`seed ${s.id}: valid=${v ? v.ok : 'skipped'}${neg ? ` proof-fails-on-base=${neg.failsOnBase}` : ''} detected=${cmp?.detected} noise=${cmp?.noise.length ?? '-'}`)
    return { ...meta(s), valid: v, negative: neg, discover: d, ...(det ? { detected_layout: { app: det.app, ui: det.ui } } : {}), ...(cmp || {}) }
  })

  const results = { at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), bases: Object.values(B).map(({ run, ...b }) => b), seeds: S }
  if (filter) {
    // a filtered run merges into the last full results instead of replacing them
    const prev = fs.existsSync(path.join(REPORT, 'results.json')) ? JSON.parse(fs.readFileSync(path.join(REPORT, 'results.json'), 'utf8')) : { bases: [], seeds: [] }
    results.bases = [...prev.bases.filter(b => !B[b.base]), ...results.bases]
    results.seeds = [...prev.seeds.filter(p => !S.some(x => x.id === p.id)), ...S]
  }
  fs.mkdirSync(REPORT, { recursive: true })
  fs.writeFileSync(path.join(REPORT, 'results.json'), JSON.stringify(results, null, 1))
  render(results, REPORT)
  const bad = S.filter(s => s.error || (s.valid && !s.valid.ok) || (s.negative && !s.negative.failsOnBase)).length + Object.values(B).filter(b => b.valid && !b.valid.ok).length
  log(`done: ${S.filter(s => s.detected).length}/${S.length} seeds detected, ${bad} invalid cases. Report: ${path.relative(process.cwd(), path.join(REPORT, 'SCORECARD.md'))}`)
  if (flag('--strict')) process.exit(strictFail(results) ? 1 : 0)
}

// CI gate: every case valid, every proof fails on its base, no regressions against report/baseline.json
function strictFail(results) {
  const basePath = path.join(REPORT, 'baseline.json')
  const want = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, 'utf8')) : { detected: [], noiseFree: [] }
  const problems = []
  for (const b of results.bases) if (b.valid && !b.valid.ok) problems.push(`base ${b.base} is not a valid app`)
  for (const s of results.seeds) {
    if (s.error) problems.push(`${s.id}: ${s.error}`)
    if (s.valid && !s.valid.ok) problems.push(`${s.id}: not a valid app`)
    if (s.negative && !s.negative.failsOnBase) problems.push(`${s.id}: proof passes on the clean base too`)
    if (want.detected.includes(s.id) && !s.detected) problems.push(`${s.id}: was detected, now missed`)
    if (want.noiseFree.includes(s.id) && (s.noise?.length || s.forbidden?.length)) problems.push(`${s.id}: was noise-free, now ${[...(s.noise || []), ...(s.forbidden || [])].map(n => n.check).join(', ')}`)
  }
  for (const b of results.bases) if ((want.controlAlarms?.[b.base] ?? Infinity) < b.alarms.filter(a => !a.accepted).length) problems.push(`base ${b.base}: more false alarms than the baseline`)
  for (const p of problems) console.error(`REGRESSION ${p}`)
  return problems.length > 0
}

const meta = s => ({ id: s.id, base: s.base, group: s.group, category: s.category, title: s.title, bug: s.bug, checks: (s.expect || []).map(e => e.check || `gap:${e.gap}`), file: s.file, hasProof: !!s.proof, probe: !!s.probe, detectable: s.detectable !== false })

if (cmd === 'list') for (const s of loadSeeds()) console.log(`${s.id.padEnd(28)} ${s.base.padEnd(10)} ${s.category.padEnd(8)} ${s.title}`)
else if (cmd === 'report') render(JSON.parse(fs.readFileSync(path.join(REPORT, 'results.json'), 'utf8')), REPORT)
else if (cmd === 'baseline') {
  const r = JSON.parse(fs.readFileSync(path.join(REPORT, 'results.json'), 'utf8'))
  const b = { at: r.at, detected: r.seeds.filter(s => s.detected).map(s => s.id).sort(), noiseFree: r.seeds.filter(s => s.detected && !s.noise?.length && !s.forbidden?.length).map(s => s.id).sort(),
    controlAlarms: Object.fromEntries(r.bases.map(x => [x.base, x.alarms.filter(a => !a.accepted).length])) }
  fs.writeFileSync(path.join(REPORT, 'baseline.json'), JSON.stringify(b, null, 1) + '\n'); console.log(`baseline: ${b.detected.length} detected, ${b.noiseFree.length} noise-free`)
} else if (cmd === 'check') process.exit(strictFail(JSON.parse(fs.readFileSync(path.join(REPORT, 'results.json'), 'utf8'))) ? 1 : 0)
else runAll().catch(e => { console.error(e); process.exit(1) })
