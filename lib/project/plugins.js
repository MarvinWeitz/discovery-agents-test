// CAP plugins whose code lives in the repository (F8): a dependency that resolves to a local folder (an
// npm workspace or a file: dependency) with a cds-plugin.js. CAP loads cds-plugin.js of every dependency
// (and devDependency outside production) at startup (@sap/cds lib/plugins.js, fetch), so this code
// runs with the app. Installed packages from the registry are not the app's code and are left out.
// Asks the probe first (cds.env.plugins with their impl paths); without an install, reads package.json
// dependencies and the workspaces of the nearest parent package.json.
// Walkthrough: docs/walkthrough/03-handlers.md · Sources: docs/walkthrough/references.md (Runtime)
const fs = require('fs')
const path = require('path')
const { cap } = require('./cap')

const PLUGIN_FILES = ['cds-plugin.js', 'cds-plugin.ts', 'cds-plugin.mjs']
const readPkg = d => { try { return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')) } catch { return null } }
const pluginIn = d => PLUGIN_FILES.map(f => path.join(d, f)).find(f => fs.existsSync(f))

// workspace package name -> folder, from the nearest parent package.json that declares workspaces
function workspaces(root) {
  let dir = path.resolve(root)
  for (let i = 0; i < 5; i++) {
    const pkg = readPkg(dir)
    const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages
    if (ws) {
      const out = {}
      for (const pat of ws) {
        const base = pat.replace(/\/\*\*?$/, '')
        const dirs = /\*$/.test(pat) ? (fs.existsSync(path.join(dir, base)) ? fs.readdirSync(path.join(dir, base), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(dir, base, d.name)) : []) : [path.join(dir, pat)]
        for (const d of dirs) { const p = readPkg(d); if (p?.name) out[p.name] = d }
      }
      return out
    }
    const up = path.dirname(dir); if (up === dir) break; dir = up
  }
  return {}
}

// [{ name, file (absolute), from: 'cap' | 'workspace' | 'file:' }]
function localPlugins(root) {
  root = path.resolve(root)
  const own = f => !f.split(path.sep).includes('node_modules')
  const c = cap(root)
  // the app's own @sap/cds answered: authoritative (the toolkit's cds would list its own plugins instead)
  if (c.cds?.from === 'app' && c.pluginImpls)
    return Object.entries(c.pluginImpls).map(([name, f]) => ({ name, file: path.resolve(root, f), from: 'cap' })).filter(p => own(p.file) && fs.existsSync(p.file))
  const pkg = readPkg(root) || {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const ws = workspaces(root)
  const out = []
  for (const [name, spec] of Object.entries(deps)) {
    const dir = /^file:/.test(spec) ? path.resolve(root, spec.slice(5)) : ws[name]
    const file = dir && pluginIn(dir)
    if (file) out.push({ name, file, from: /^file:/.test(spec) ? 'file:' : 'workspace' })
  }
  return out
}

module.exports = { localPlugins, workspaces }
