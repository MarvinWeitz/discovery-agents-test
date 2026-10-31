#!/usr/bin/env node
// Phase 1 skeleton map: node bin/discover.js <app-root> <out-dir>
// Step 2–6 · Walkthrough: docs/walkthrough/README.md
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const cds = require('@sap/cds')
const { Graph } = require('../lib/graph')
const { cap } = require('../lib/project/cap')
const { extractModel } = require('../lib/extract/model')
const { extractHandlers } = require('../lib/extract/handlers/regex')
const { extractHandlersAst } = require('../lib/extract/handlers')
const { reflexionUi } = require('../lib/analyse/reflexion-ui')
const { extractUI5 } = require('../lib/extract/ui5')
const { extractConfig } = require('../lib/extract/config')
const { extractAuth } = require('../lib/extract/auth')
const { extractTests } = require('../lib/extract/tests')
const { extractHistory } = require('../lib/extract/history')
const { extractCdsDeps } = require('../lib/extract/cds-deps')
const { extractNative } = require('../lib/extract/native')
const { extractLint } = require('../lib/extract/lint')
const { cutSlices, rank, splitSlices, coverage } = require('../lib/analyse/slices')
const { deriveClasses } = require('../lib/analyse/classes')
const { render } = require('../lib/report/report')
const { renderDiagrams } = require('../lib/report/render-diagrams')

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
  const project = cap(root)                                                    // 1b  what CAP says: config per profile, model files, endpoints, impls, seed data
  const g = new Graph(run)
  const csn = await extractModel(cds, root, g)                                // 2   CDS -> services, entities, grants
  const handlers = (regex ? extractHandlers : extractHandlersAst)(root, g, csn) // 3   handlers, rules, reads/writes, events
  const uiRules = reflexionUi(root, g, csn)                                   // 4   UI annotations vs handler rules
  extractUI5(root, g, uiDirs)                                                 // 5a  UI5 apps, routes, views
  const config = extractConfig(root, g)                                       // 5b  remote services, brokers, HDI files
  config.auth = extractAuth(root, g, cds)                                     // 5c  mock users, roles
  config.cdsDeps = extractCdsDeps(root, g, csn)                               // 5f  CDS file layers
  config.native = extractNative(root, g)                                      // 5g  HANA-native objects
  extractTests(root, g)                                                       // 5d  existing tests
  const lint = extractLint(root, g, uiDirs)                                   // 5h  cds lint, ui5 lint
  const history = extractHistory(root)                                        // 5e  git churn

  const slices = splitSlices(g, rank(g, cutSlices(g), history))               // 6   slices ranked by risk
  const cov = coverage(g)
  const classes = deriveClasses(g)

  fs.mkdirSync(path.join(outDir, 'graph'), { recursive: true })
  fs.mkdirSync(path.join(outDir, 'slices'), { recursive: true })
  fs.mkdirSync(path.join(outDir, 'tests'), { recursive: true })
  const { nodes, edges } = g.toJSONL()
  fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify({ ...project, model: { ...project.model, csnFile: undefined }, edmx: project.edmx && Object.keys(project.edmx) }, null, 1))
  fs.writeFileSync(path.join(outDir, 'csn.json'), JSON.stringify({ ...csn, $sources: csn.$sources }))
  // OData $metadata per service from the probe (what the UI receives)
  if (project.edmx) { fs.mkdirSync(path.join(outDir, 'edmx'), { recursive: true }); for (const [n, f] of Object.entries(project.edmx)) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(outDir, 'edmx', n + '.xml')) }
  fs.writeFileSync(path.join(outDir, 'graph', 'nodes.jsonl'), nodes)
  fs.writeFileSync(path.join(outDir, 'graph', 'edges.jsonl'), edges)
  fs.writeFileSync(path.join(outDir, 'slices', 'catalog.json'), JSON.stringify(slices.map(({ members, ...s }) => ({ ...s, members, status: 'planned' })), null, 2))
  fs.writeFileSync(path.join(outDir, 'tests', 'class-seeds.json'), JSON.stringify(classes, null, 2))
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify({ run, app, root, commit, handlers, uiRules, auth: config.auth, cdsDeps: config.cdsDeps, native: config.native, lint, coverage: { ...cov, unassigned: cov.unassigned.length } }, null, 2))
  fs.writeFileSync(path.join(outDir, 'discovery-report.md'), render({ app, commit, g, slices, cov, lint, config, classes, history, run }))
  const diagrams = await renderDiagrams(path.join(outDir, 'discovery-report.md'))
  console.log(`${app}: ${g.nodes.size} nodes, ${g.edges.length} edges, ${slices.length} slices, coverage ${Math.round(cov.ratio * 100)}%, ${diagrams.rendered} diagrams rendered`)
}

main().catch(e => { console.error(e); process.exit(1) })
