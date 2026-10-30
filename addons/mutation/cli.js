#!/usr/bin/env node
// node addons/mutation/cli.js <stryker mutation.json> <app-out>
// Writes <app-out>/mutation.md and mutation-summary.json; adds the MUT section to atlas-data.json
// when it exists (rebuild the atlas afterwards with bin/atlas.js).
const fs = require('fs')
const path = require('path')
const { analyse } = require('./mutation')
const { apply, summaryMd } = require('./index')

const [reportFile, out] = process.argv.slice(2)
if (!reportFile || !out) { console.error('usage: cli.js <mutation.json> <app-out>'); process.exit(2) }
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const M = { at: new Date().toISOString().slice(0, 16) + 'Z', ...analyse(report, { manifest: readJson(path.join(out, 'run', 'tests', 'generated', 'manifest.json')), runDir: path.join(out, 'run') }) }
fs.writeFileSync(path.join(out, 'mutation-summary.json'), JSON.stringify(M, null, 1))
fs.writeFileSync(path.join(out, 'mutation.md'), summaryMd(M))
const file = path.join(out, 'atlas-data.json'), D = readJson(file)
if (D) { D.MUTATION = M; apply(D); fs.writeFileSync(file, JSON.stringify(D, null, 1)) }
console.log(`mutation score ${M.score}% (${M.killed} of ${M.valid} mutants killed), ${M.survivors.length} survivors`)
