// One place that reads discovery.config.json, so the toolkit behaves the same whether it runs from its own
// repo (central mode) or inside a project (portable mode, bin/cap-discovery.js).
//   1. the toolkit's own discovery.config.json: the defaults
//   2. the project's file, merged on top: $DISCOVERY_CONFIG (a path), set by bin/cap-discovery.js to
//      <project>/discovery.config.json when that file exists
// Objects merge key by key ("addons": { "mutation": false } turns off one addon and keeps the rest);
// everything else replaces. Environment switches (DISCOVERY_MODE, DISCOVERY_ADDONS_OFF, DISCOVERY_STAGES_OFF)
// still win over both files; they are read where they apply (lib/stages.js, lib/addons.js).
const fs = require('fs')
const path = require('path')

const DEFAULTS = path.join(__dirname, '..', 'discovery.config.json')
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const plain = v => v && typeof v === 'object' && !Array.isArray(v)

function merge(a, b) {
  if (!plain(a) || !plain(b)) return b === undefined ? a : b
  const o = { ...a }
  for (const [k, v] of Object.entries(b)) o[k] = merge(a[k], v)
  return o
}

function config() {
  const base = read(DEFAULTS) || {}
  const own = process.env.DISCOVERY_CONFIG && path.resolve(process.env.DISCOVERY_CONFIG) !== DEFAULTS ? read(process.env.DISCOVERY_CONFIG) : null
  return own ? merge(base, own) : base
}

// which files the config came from, for the run manifest and `cap-discovery doctor`
const sources = () => [DEFAULTS, ...(process.env.DISCOVERY_CONFIG && read(process.env.DISCOVERY_CONFIG) ? [path.resolve(process.env.DISCOVERY_CONFIG)] : [])]

module.exports = { config, merge, sources, DEFAULTS }
