#!/usr/bin/env node
// Phase 1 skeleton map: node bin/discover.js <app-root> <out-dir>
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const cds = require('@sap/cds')
const { Graph } = require('../lib/graph')
const { extractModel } = require('../lib/extract-model')
const { extractHandlers } = require('../lib/extract-handlers')
const { extractHandlersAst } = require('../lib/extract-handlers-ast')
const { reflexionUi } = require('../lib/reflexion-ui')
const { extractUI5, extractConfig, extractAuth, extractTests, extractHistory } = require('../lib/extract-app')
const { extractCdsDeps } = require('../lib/extract-cds-deps')
const { extractLint } = require('../lib/extract-lint')
const { cutSlices, rank, splitSlices, coverage } = require('../lib/slices')
const { deriveClasses } = require('../lib/classes')
const { render } = require('../lib/report')
const { renderDiagrams } = require('../lib/render-diagrams')

async function main() {
  const args = process.argv.slice(2)
  const regex = args.includes('--regex') // old text-matching extractor, kept for comparison
  const ui = args.indexOf('--ui')
  const uiDirs = ui >= 0 ? args[ui + 1].split(',') : [] // extra UI5 project folders, relative to the app root
  const [root, outDir] = args.filter((a, i) => !a.startsWith('--') && (ui < 0 || i !== ui + 1)).map(p => path.resolve(p))
  if (!root || !outDir) throw new Error('usage: discover <app-root> <out-dir>')
  const run = new Date().toISOString().slice(0, 16) + 'Z'
  const app = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name
  let commit = 'unknown'
  try { commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch {}

  cds.root = root
  const g = new Graph(run)
  const csn = await extractModel(cds, root, g)
  const handlers = (regex ? extractHandlers : extractHandlersAst)(root, g, csn)
  const uiRules = reflexionUi(root, g, csn)
  extractUI5(root, g, uiDirs)
  const config = extractConfig(root, g)
  config.auth = extractAuth(root, g, cds)
  config.cdsDeps = extractCdsDeps(root, g, csn)
  extractTests(root, g)
  const lint = extractLint(root, g, uiDirs)
  const history = extractHistory(root)

  const slices = splitSlices(g, rank(g, cutSlices(g), history))
  const cov = coverage(g)
  const classes = deriveClasses(g)

  fs.mkdirSync(path.join(outDir, 'graph'), { recursive: true })
  fs.mkdirSync(path.join(outDir, 'slices'), { recursive: true })
  fs.mkdirSync(path.join(outDir, 'tests'), { recursive: true })
  const { nodes, edges } = g.toJSONL()
  fs.writeFileSync(path.join(outDir, 'graph', 'nodes.jsonl'), nodes)
  fs.writeFileSync(path.join(outDir, 'graph', 'edges.jsonl'), edges)
  fs.writeFileSync(path.join(outDir, 'slices', 'catalog.json'), JSON.stringify(slices.map(({ members, ...s }) => ({ ...s, members, status: 'planned' })), null, 2))
  fs.writeFileSync(path.join(outDir, 'tests', 'class-seeds.json'), JSON.stringify(classes, null, 2))
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify({ run, app, root, commit, handlers, uiRules, auth: config.auth, cdsDeps: config.cdsDeps, lint, coverage: { ...cov, unassigned: cov.unassigned.length } }, null, 2))
  fs.writeFileSync(path.join(outDir, 'discovery-report.md'), render({ app, commit, g, slices, cov, lint, config, classes, history, run }))
  const diagrams = await renderDiagrams(path.join(outDir, 'discovery-report.md'))
  console.log(`${app}: ${g.nodes.size} nodes, ${g.edges.length} edges, ${slices.length} slices, coverage ${Math.round(cov.ratio * 100)}%, ${diagrams.rendered} diagrams rendered`)
}

main().catch(e => { console.error(e); process.exit(1) })
