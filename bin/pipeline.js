#!/usr/bin/env node
// The whole pipeline for one app, stage by stage (lib/stages.js says what each reads and writes):
//   node bin/pipeline.js <app-root> <out-dir> [--ui ../ui-a,../ui-b] [--base curated.json] [--mode static|static+ai]
//
//   discover     out/run/            graph, CSN, $metadata, slices, metrics, report
//   facts        out/atlas-data.json atlas facts (+ addons)
//   findings     out/run/findings/   the middle layer: findings.jsonl + gaps.jsonl (JSON Schema), README.md
//   tests        out/run/tests/generated/
//   atlas        out/atlas/          README.md, topics/*.md, images/*.png, index.html
//   ai-requests  out/run/ai/         (mode static+ai only) one request per open gap an AI can settle
//   validate     schemas and references of everything above
// Every stage is recorded in out/manifest.json (status, time, outputs with sha256).
// Mode: --mode beats DISCOVERY_MODE beats discovery.config.json "mode"; default static (no AI anywhere).
// Stage switches: "stages": { "findings": false } in discovery.config.json, or DISCOVERY_STAGES_OFF=findings.
// Walkthrough: docs/walkthrough/README.md · Stages: docs/stages.md
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { mode: modeOf, stageOn } = require('../lib/stages')
const manifest = require('../lib/manifest')
const addons = require('../lib/addons')

const args = process.argv.slice(2)
const VALUED = ['--ui', '--base', '--mode']
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const pos = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]))
const [root, out] = pos.map(p => path.resolve(p))
if (!root || !out) { console.error('usage: pipeline <app-root> <out-dir> [--ui dirs] [--base curated.json] [--mode static|static+ai]'); process.exit(2) }
const mode = modeOf(opt('--mode'))
const bin = f => path.join(__dirname, f)
const run = path.join(out, 'run'), facts = path.join(out, 'atlas-data.json')

let pkg = {}
try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) } catch {}
const M = manifest.start(out, { mode, root, app: pkg.name, addons: Object.fromEntries(Object.keys(addons.config().addons || {}).map(a => [a, addons.enabled(a)])) })

function step(id, file, a, { optional = false } = {}) {
  const started = new Date().toISOString(), t = Date.now()
  try {
    const o = execFileSync(process.execPath, [bin(file), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000 })
    const said = o.trim().split('\n').pop()
    manifest.record(M, { id, status: 'ran', started, seconds: +((Date.now() - t) / 1000).toFixed(1), said, outputs: manifest.outputs(out, id) })
    console.log(`[${id}] ${said} (${((Date.now() - t) / 1000).toFixed(1)}s)`)
  } catch (e) {
    manifest.record(M, { id, status: 'failed', started, seconds: +((Date.now() - t) / 1000).toFixed(1), said: String(e.stdout || e.message).trim().split('\n').pop().slice(0, 300) })
    manifest.save(out, M)
    if (!optional) { console.error(`[${id}] failed; see ${path.join(out, 'manifest.json')}`); process.exit(1) }
    console.error(`[${id}] failed (optional stage, run continues)`)
  }
  manifest.save(out, M)
}
const skip = (id, status, why) => { manifest.record(M, { id, status, why }); manifest.save(out, M); console.log(`[${id}] ${status}: ${why}`) }

step('discover', 'discover.js', [root, run, ...(opt('--ui') ? ['--ui', opt('--ui')] : [])])
M.app.commit = (() => { try { return JSON.parse(fs.readFileSync(path.join(run, 'metrics.json'), 'utf8')).commit } catch { return null } })()
step('facts', 'atlas-facts.js', [run, facts, ...(opt('--base') ? ['--base', path.resolve(opt('--base'))] : [])])
if (stageOn('findings')) step('findings', 'findings.js', [out, '--mode', mode]); else skip('findings', 'off', 'stages.findings is false or DISCOVERY_STAGES_OFF names it')
step('tests', 'gen-tests.js', [run])
step('atlas', 'atlas.js', [facts, path.join(out, 'atlas')])
if (mode !== 'static+ai') skip('ai-requests', 'off', `mode ${mode}`)
else if (!stageOn('findings')) skip('ai-requests', 'skipped', 'needs the findings stage')
else step('ai-requests', 'ai-requests.js', [out])
step('validate', 'validate.js', [out])
