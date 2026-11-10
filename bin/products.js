#!/usr/bin/env node
// Stage "products": one product per step under <out>/steps/ (lib/products/index.js says what and why).
//   node bin/products.js <out> [--base <other-out>] [--generated jest-generated.json]
// --base adds the change of every number since that run; --generated points at Jest results (CI).
// Walkthrough: docs/walkthrough/14-step-products.md
const path = require('path')
const { build } = require('../lib/products')

const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const out = args.find((a, i) => !a.startsWith('--') && !['--base', '--generated'].includes(args[i - 1]))
if (!out) { console.error('usage: products <out> [--base <other-out>] [--generated jest.json]'); process.exit(2) }
const r = build(path.resolve(out), { base: opt('--base') && path.resolve(opt('--base')), generated: opt('--generated') && path.resolve(opt('--generated')) })
for (const s of r.list) if (s.status === 'failed') console.error(`[products] ${s.id} failed: ${s.why}`)
console.log(r.said)
