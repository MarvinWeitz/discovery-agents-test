// Optional modules in addons/<name>/, switched in discovery.config.json ("addons": {"<name>": true}).
// DISCOVERY_ADDONS_OFF=coverage,docs turns modules off for one run without editing the file.
// A missing folder counts as off, so deleting addons/<name> removes a module with nothing left to break.
//
// An addon's index.js may export:
//   facts(D, ctx)      after atlas-facts: add data, sections and KPIs to the atlas fact file
//                      ctx = { g, td, csn, root, metrics, runDir }
//   afterTests(ctx)    after the generated tests ran in CI (bin/after-tests.js); returns true if it
//                      changed atlas-data.json. ctx = { out, app, results: { generated, baseline } }
//   topics             { CODE: D => markdown } for bin/atlas.js
//   views              path of a browser script that registers ADDON_RENDER['CODE-A'] = fn
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DIR = path.join(ROOT, 'addons')

function config() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'discovery.config.json'), 'utf8')) } catch { return {} }
}

function enabled(name) {
  const off = String(process.env.DISCOVERY_ADDONS_OFF || '').split(',').map(s => s.trim())
  if (off.includes(name) || off.includes('all')) return false
  return config().addons?.[name] === true && fs.existsSync(path.join(DIR, name, 'index.js'))
}

// enabled addons in config order
function list() {
  return Object.keys(config().addons || {}).filter(enabled).map(name => ({ name, ...require(path.join(DIR, name, 'index.js')) }))
}

module.exports = { enabled, list, config }
