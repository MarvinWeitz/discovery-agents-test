#!/usr/bin/env node
// Stage "after-tests": runs the afterTests hook of every enabled addon once CI has executed the tests,
// rebuilds the atlas if any addon changed the facts, then runs the findings stage again so measured
// findings settle the gaps they answer, and validates. Each step is recorded in <out>/manifest.json.
//   node bin/after-tests.js <app-out> [--generated jest-generated.json] [--baseline jest-baseline.json]
// <app-out> is the pipeline's out dir (holds atlas-data.json, run/, atlas/).
// Step 11 · Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const addons = require('../lib/addons')
const { stageOn, mode: modeOf } = require('../lib/stages')
const manifest = require('../lib/manifest')

const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const out = path.resolve(args.find((a, i) => !a.startsWith('--') && !['--generated', '--baseline'].includes(args[i - 1])) || '')
if (!fs.existsSync(path.join(out, 'atlas-data.json'))) { console.error('usage: after-tests <app-out> [--generated jest.json] [--baseline jest.json]'); process.exit(2) }
const read = f => { try { return f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null } catch { return null } }
const results = { generated: read(opt('--generated')), baseline: read(opt('--baseline')) }
const started = new Date().toISOString(), t0 = Date.now()
let changed = false
for (const a of addons.list()) if (a.afterTests) { const c = a.afterTests({ out, results }); console.log(`[${a.name}] ${c ? 'updated the facts' : 'no change'}`); changed ||= !!c }
if (changed) execFileSync(process.execPath, [path.join(__dirname, 'atlas.js'), path.join(out, 'atlas-data.json'), path.join(out, 'atlas')], { stdio: 'inherit' })
const M = manifest.read(out)
const node = (f, ...a) => execFileSync(process.execPath, [path.join(__dirname, f), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim().split('\n').pop()
if (M) manifest.record(M, { id: 'after-tests', status: 'ran', started, seconds: +((Date.now() - t0) / 1000).toFixed(1), said: changed ? 'addons updated the facts; atlas rebuilt' : 'no addon changed the facts', outputs: manifest.outputs(out, 'after-tests') })
let ok = true
if (stageOn('findings')) {
  const t1 = Date.now()
  try {
    const said = node('findings.js', out, '--mode', M?.mode || modeOf())
    console.log(`[findings] ${said}`)
    if (M) manifest.record(M, { id: 'findings', status: 'ran', started: new Date(t1).toISOString(), seconds: +((Date.now() - t1) / 1000).toFixed(1), said, outputs: manifest.outputs(out, 'findings') })
  } catch (e) { ok = false; if (M) manifest.record(M, { id: 'findings', status: 'failed', said: String(e.message).split('\n')[0] }) }
}
if (M) manifest.save(out, M)
try { console.log(`[validate] ${node('validate.js', out)}`) } catch { ok = false }
if (!ok) process.exit(1)
