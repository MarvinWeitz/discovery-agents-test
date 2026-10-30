#!/usr/bin/env node
// Whole deterministic pipeline for one app:
//   node bin/pipeline.js <app-root> <out-dir> [--ui ../ui-a,../ui-b] [--base curated.json]
// out-dir/run      knowledge graph, metrics, slices, report (discover)
// out-dir/run/tests/generated   cds.test suites (gen-tests)
// out-dir/atlas    README.md + topics/*.md + images/*.png + index.html (atlas-facts + atlas)
const path = require('path')
const { execFileSync } = require('child_process')

const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const pos = args.filter((a, i) => !a.startsWith('--') && !['--ui', '--base'].includes(args[i - 1]))
const [root, out] = pos.map(p => path.resolve(p))
if (!root || !out) { console.error('usage: pipeline <app-root> <out-dir> [--ui dirs] [--base curated.json]'); process.exit(2) }
const bin = f => path.join(__dirname, f)
const step = (name, file, a) => { const t = Date.now(); const o = execFileSync(process.execPath, [bin(file), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000 }); console.log(`[${name}] ${o.trim().split('\n').pop()} (${((Date.now() - t) / 1000).toFixed(1)}s)`) }
const run = path.join(out, 'run'), facts = path.join(out, 'atlas-data.json')
step('discover', 'discover.js', [root, run, ...(opt('--ui') ? ['--ui', opt('--ui')] : [])])
step('facts', 'atlas-facts.js', [run, facts, ...(opt('--base') ? ['--base', path.resolve(opt('--base'))] : [])])
step('tests', 'gen-tests.js', [run])
step('atlas', 'atlas.js', [facts, path.join(out, 'atlas')])
