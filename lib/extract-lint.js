// Lint collector: runs cds lint (via @sap/eslint-plugin-cds) and UI5 linter, turns messages into Finding nodes.
const path = require('path')
const { execFileSync } = require('child_process')
const { walk } = require('./extract-handlers')

const BIN = path.join(__dirname, '..', 'node_modules', '.bin')

function run(cmd, args, cwd) {
  try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000 }) }
  catch (e) { return e.stdout || '[]' } // linters exit non-zero when they find errors
}

function addFindings(g, root, results, tool, base) {
  let n = 0
  for (const r of results) {
    const rel = path.relative(root, path.resolve(base, r.filePath))
    g.node(`file:${rel}`, 'SourceFile', { path: rel }, { evidence: `${rel}:1`, source: `tool:${tool}` })
    for (const msg of r.messages || []) {
      const id = `finding:${tool}:${rel}:${msg.line}:${msg.ruleId}`
      g.node(id, 'Finding', { tool, rule: msg.ruleId, severity: msg.severity === 2 ? 'error' : 'warning', message: msg.message }, { evidence: `${rel}:${msg.line}`, source: `tool:${tool}` })
      g.edge(id, 'on', `file:${rel}`, {}, { evidence: `${rel}:${msg.line}`, source: `tool:${tool}` })
      n++
    }
  }
  return n
}

function extractLint(root, g, uiDirs = []) {
  const out = { cdsLint: 0, ui5Lint: 0 }
  const cfg = path.join(__dirname, '..', 'eslint.cds.config.mjs')
  const cds = run(path.join(BIN, 'eslint'), ['--no-config-lookup', '-c', cfg, '-f', 'json', 'db/**/*.cds', 'srv/**/*.cds', 'app/**/*.cds'], root)
  try { out.cdsLint = addFindings(g, root, JSON.parse(cds), 'cds-lint', root) } catch { out.cdsLint = null }

  for (const yaml of ['app', ...uiDirs].flatMap(d => walk(path.join(root, d), p => path.basename(p) === 'ui5.yaml' && !p.includes('node_modules')))) {
    const dir = path.dirname(yaml)
    const ui5 = run(path.join(BIN, 'ui5lint'), ['--format', 'json'], dir)
    try { out.ui5Lint += addFindings(g, root, JSON.parse(ui5), 'ui5-lint', dir) } catch { out.ui5Lint = null }
  }
  return out
}

module.exports = { extractLint }
