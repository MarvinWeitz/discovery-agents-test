#!/usr/bin/env node
// Writes atlas-data.json from a discovery run: node bin/atlas-facts.js <run-dir> <out.json> [--base curated.json]
// Every section is generated from the graph, the CSN and the app's files. The optional curated base
// adds agent findings (risks) and can override META texts; risks a rule now detects are dropped from it.
// Step 11 · Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const fs = require('fs')
const path = require('path')
const cds = require('@sap/cds')
const { loadRun } = require('../lib/load')
const { compiledModel, remember } = require('../lib/project/cap')
const { buildAtlas } = require('../lib/atlas')
const addons = require('../lib/addons')

async function main() {
  const args = process.argv.slice(2)
  const bi = args.indexOf('--base')
  const curated = bi >= 0 ? JSON.parse(fs.readFileSync(args[bi + 1], 'utf8')) : {}
  const [runDir, outFile] = args.filter((a, i) => !a.startsWith('--') && (bi < 0 || i !== bi + 1))
  if (!runDir || !outFile) throw new Error('usage: atlas-facts <run-dir> <out.json> [--base curated.json]')
  const metrics = JSON.parse(fs.readFileSync(path.join(runDir, 'metrics.json'), 'utf8'))
  const root = metrics.root
  if (!root || !fs.existsSync(root)) throw new Error(`app root ${root} from metrics.json not found; rerun discover`)
  const known = path.join(runDir, 'project.json')
  if (fs.existsSync(known)) remember(root, JSON.parse(fs.readFileSync(known, 'utf8')))
  cds.root = root
  const csn = await compiledModel(root, cds, path.join(runDir, 'csn.json'))
  const { g } = loadRun(runDir)
  const { D, td } = buildAtlas({ g, csn, root, metrics, curated })
  for (const a of addons.list()) if (a.facts) await a.facts(D, { g, td, csn, root, metrics, runDir, out: path.dirname(path.resolve(outFile)) })
  fs.writeFileSync(outFile, JSON.stringify(D, null, 1))
  const s = D.META.sources
  console.log(`atlas facts written: ${outFile} (${D.SECTIONS.length} sections; ${Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', ')}; ${D.RISKS.length} risks, ${D.PATTERNS.length} patterns, ${D.TESTCATS.reduce((a, c) => a + c.cls, 0)} classes)`)
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1) })
