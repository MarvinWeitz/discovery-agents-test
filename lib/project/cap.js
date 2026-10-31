// What CAP itself says about the project: effective config per profile, model files, service endpoints,
// service implementations, seed data. Runs lib/project/probe.js once per app root (in its own process,
// with the app's own @sap/cds when installed) and caches the answer. Every later step asks this instead
// of guessing from folder names or config file text.
// Walkthrough: docs/walkthrough/00-assumptions.md · Sources: docs/walkthrough/references.md
const path = require('path')
const { execFileSync } = require('child_process')

const cache = new Map()

function cap(root) {
  root = path.resolve(root)
  if (cache.has(root)) return cache.get(root)
  let out
  try {
    out = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'probe.js'), root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000, maxBuffer: 64 << 20 }))
  } catch (e) { out = { errors: [`probe: ${e.message.split('\n')[0]}`] } }
  out.ok = !!out.model?.sources
  // the app's own files (not packages), as CAP compiled them
  out.ownSources = (out.model?.sources || []).filter(f => !f.startsWith('..') && !f.includes('node_modules/'))
  cache.set(root, out)
  return out
}

// Reuse an answer written earlier (run/project.json), so later steps see the same project as discover did
function remember(root, answer) { cache.set(path.resolve(root), answer) }

// CDS files to compile: what cds.resolve('*') returns for the app, else the layout folders
function modelFiles(root) {
  const c = cap(root)
  return c.model?.files?.length ? c.model.files.map(f => path.resolve(root, f)) : require('./layout').layout(root).modelDirs
}

// The app's own CDS files (absolute paths), as CAP compiled them: files outside db/srv/app that the model
// uses are included, files the model never reaches (samples, leftovers) are not. Listed in the
// layout's search order app, srv, db, then the rest. Without a compiled model: every .cds file in the
// layout folders, minus the ignored sample folders.
function cdsSources(root) {
  const { walk } = require('./files'), L = require('./layout').layout(root)
  const walked = L.cdsSourceDirs.flatMap(d => walk(d, p => p.endsWith('.cds')))
  const c = cap(root)
  if (!c.ok) return walked.filter(f => !path.relative(root, f).split(path.sep).some(d => L.ignored.includes(d)))
  const own = new Set(c.ownSources.map(f => path.resolve(root, f)))
  return [...walked.filter(f => own.has(f)), ...[...own].filter(f => !walked.includes(f))]
}

// CSV seed data CAP would load, with the entity CAP maps each file to (cds.deploy.resources: data/ and csv/
// next to every model file, plus cds.requires.db.data, plus test/data). Without the probe: the layout's seed folders.
function seedFiles(root) {
  const c = cap(root)
  if (c.seed) return Object.entries(c.seed).filter(([f]) => f.endsWith('.csv')).map(([f, entity]) => ({ file: path.resolve(root, f), entity }))
  const { walk } = require('./files')
  return require('./layout').layout(root).seedDirs.flatMap(d => walk(d, p => p.endsWith('.csv'))).map(file => ({ file, entity: path.basename(file, '.csv').replace(/-/g, '.') }))
}

// Database kinds per profile: { development: 'sqlite', production: 'hana' } (null when CAP was not asked)
function dbKinds(root) {
  const c = cap(root)
  if (!c.requires) return null
  return { development: c.requires.db?.kind || null, production: c.production?.requires?.db?.kind || null }
}

module.exports = { cap, remember, modelFiles, cdsSources, seedFiles, dbKinds }
