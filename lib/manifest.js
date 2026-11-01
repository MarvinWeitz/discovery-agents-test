// <out>/manifest.json: which stages ran, in which mode, when, how long, with which switches, and what
// each wrote (size and sha256 per file, file count per folder). Schema: schema/manifest.schema.json.
// Written by bin/pipeline.js; bin/after-tests.js and bin/ai-merge.js add their stages to it.
// Stage list: lib/stages.js · Walkthrough: docs/walkthrough/13-findings-and-gaps.md
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { byId } = require('./stages')

const TOOLKIT = path.join(__dirname, '..')

function toolkit() {
  let commit = null
  try { commit = execFileSync('git', ['-C', TOOLKIT, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
  let cds = null
  try { cds = require('@sap/cds/package.json').version } catch {}
  return { version: require('../package.json').version, commit, node: process.version, cds }
}

const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]) }

// a stage's declared outputs, as they exist under <out>: "run/edmx/" or "pr/*.md" -> the folder
function outputs(out, id) {
  const st = byId(id); if (!st) return []
  const seen = new Set(), res = []
  for (const o of st.out) {
    if (/^(the |exit )/.test(o)) continue
    const p = o.split(/[*<]/)[0].replace(/\/$/, '').replace(/ .*$/, '')
    const abs = path.join(out, p)
    if (!p || seen.has(p) || !fs.existsSync(abs)) continue
    seen.add(p)
    if (fs.statSync(abs).isDirectory()) { const files = walk(abs); res.push({ path: p + '/', files: files.length, bytes: files.reduce((a, f) => a + fs.statSync(f).size, 0) }) }
    else res.push({ path: p, bytes: fs.statSync(abs).size, sha256: sha(abs) })
  }
  return res
}

function read(out) { try { return JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) } catch { return null } }

function start(out, { mode, root, app, commit, addons }) {
  return { toolkit: toolkit(), mode, app: { root, name: app || null, commit: commit || null }, addons, stages: [] }
}

// replace the stage's entry (a stage run twice, e.g. findings after the tests, keeps its last result)
function record(M, entry) {
  const st = byId(entry.id)
  const e = { method: st?.method, ...entry }
  const i = M.stages.findIndex(s => s.id === e.id)
  if (i >= 0) M.stages[i] = e; else M.stages.push(e)
  return e
}

function save(out, M) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(M, null, 1)) }

module.exports = { start, record, save, read, outputs, toolkit }
