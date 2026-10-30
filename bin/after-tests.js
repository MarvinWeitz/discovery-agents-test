#!/usr/bin/env node
// Runs the afterTests hook of every enabled addon once CI has executed the tests, then rebuilds the
// atlas if any addon changed the facts:
//   node bin/after-tests.js <app-out> [--generated jest-generated.json] [--baseline jest-baseline.json]
// <app-out> is the pipeline's out dir (holds atlas-data.json, run/, atlas/).
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const addons = require('../lib/addons')

const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const out = path.resolve(args.find((a, i) => !a.startsWith('--') && !['--generated', '--baseline'].includes(args[i - 1])) || '')
if (!fs.existsSync(path.join(out, 'atlas-data.json'))) { console.error('usage: after-tests <app-out> [--generated jest.json] [--baseline jest.json]'); process.exit(2) }
const read = f => { try { return f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null } catch { return null } }
const results = { generated: read(opt('--generated')), baseline: read(opt('--baseline')) }
let changed = false
for (const a of addons.list()) if (a.afterTests) { const c = a.afterTests({ out, results }); console.log(`[${a.name}] ${c ? 'updated the facts' : 'no change'}`); changed ||= !!c }
if (changed) execFileSync(process.execPath, [path.join(__dirname, 'atlas.js'), path.join(out, 'atlas-data.json'), path.join(out, 'atlas')], { stdio: 'inherit' })
