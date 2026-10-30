#!/usr/bin/env node
// node addons/diff/cli.js <base-out> <head-out> <report-dir> [--title "…"] [--note "…"] [--fail-on-new]
// Writes diff.json and diff.md (the PR comment). --fail-on-new exits 1 when risks, pattern breaks,
// lost class tests or newly open authorization cells appear (for a blocking check).
const fs = require('fs')
const path = require('path')
const { diff } = require('./diff')
const { render } = require('./report')

const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const [base, head, out] = args.filter((a, i) => !a.startsWith('--') && !['--title', '--note'].includes(args[i - 1]))
if (!base || !head || !out) { console.error('usage: cli.js <base-out> <head-out> <report-dir> [--title t] [--note n] [--fail-on-new]'); process.exit(2) }
const d = diff(base, head)
const { md, bad } = render(d, { title: opt('--title') || undefined, note: opt('--note') || '' })
fs.mkdirSync(out, { recursive: true })
const { _a, _b, ...json } = d
json.graph = { ...d.graph, ids: undefined }
fs.writeFileSync(path.join(out, 'diff.json'), JSON.stringify(json, null, 1))
fs.writeFileSync(path.join(out, 'diff.md'), md)
console.log(md.split('\n').slice(0, 3).join('\n'))
if (args.includes('--fail-on-new') && bad) process.exit(1)
