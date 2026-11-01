#!/usr/bin/env node
// Stage "findings": writes the middle layer of a run, run/findings/ (findings.jsonl, gaps.jsonl,
// summary.json, README.md) from what discover and facts produced. Runs again after the tests in CI
// (bin/after-tests.js), so measured results settle the gaps they answer.
//   node bin/findings.js <out> [--mode static|static+ai]
// <out> is the pipeline's out dir (holds run/ and atlas-data.json). Exit 1 when a finding or gap does
// not match its schema. Stages: lib/stages.js · Walkthrough: docs/walkthrough/13-findings-and-gaps.md
const fs = require('fs')
const path = require('path')
const cds = require('@sap/cds')
const { loadRun } = require('../lib/load')
const { compiledModel, remember } = require('../lib/project/cap')
const { build, write } = require('../lib/findings')
const { mode: modeOf } = require('../lib/stages')
const addons = require('../lib/addons')

async function main() {
  const args = process.argv.slice(2)
  const mi = args.indexOf('--mode')
  const out = path.resolve(args.find((a, i) => !a.startsWith('--') && (mi < 0 || i !== mi + 1)) || '')
  const runDir = path.join(out, 'run')
  if (!fs.existsSync(path.join(runDir, 'metrics.json'))) { console.error('usage: findings <out> [--mode static|static+ai]  (<out>/run/metrics.json missing: run discover first)'); process.exit(2) }
  const mode = modeOf(mi >= 0 ? args[mi + 1] : null)
  const metrics = JSON.parse(fs.readFileSync(path.join(runDir, 'metrics.json'), 'utf8'))
  const root = metrics.root
  if (!root || !fs.existsSync(root)) throw new Error(`app root ${root} from metrics.json not found; rerun discover`)
  const pj = path.join(runDir, 'project.json')
  const project = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : null
  if (project) remember(root, project)
  cds.root = root
  const csn = await compiledModel(root, cds, path.join(runDir, 'csn.json'))
  const { g, slices } = loadRun(runDir)
  const df = path.join(out, 'atlas-data.json')
  const D = fs.existsSync(df) ? JSON.parse(fs.readFileSync(df, 'utf8')) : null
  const result = await build({ g, csn, root, metrics, project, slices, D, runDir, out, mode, addons: addons.list() })
  const { summary: S, problems } = write(result, { runDir, out, mode, meta: { app: metrics.app, commit: metrics.commit } })
  for (const p of problems.slice(0, 30)) console.error(`schema: ${p}`)
  console.log(`findings (${mode}): ${S.findings.total} findings (${Object.entries(S.findings.byMethod).map(([k, v]) => `${v} ${k}`).join(', ')}), ${S.gaps.open} open gaps of ${S.gaps.total} → ${path.join(runDir, 'findings')}`)
  if (problems.length) process.exit(1)
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1) })
