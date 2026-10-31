// Where things are in a CAP project. Every folder name the pipeline relies on is decided here, once,
// so a project that differs (other folder names, seed data elsewhere) is fixed in one place.
// The db/srv/app folders come from CAP's own configuration (cds.env.folders, which reads package.json
// "cds", .cdsrc.json, .cdsrc.yaml and profiles); the rest are conventions listed below.
// Walkthrough: docs/walkthrough/00-assumptions.md
const fs = require('fs')
const path = require('path')

// CAP's defaults, used when cds cannot be loaded
const DEFAULT_FOLDERS = { db: 'db/', srv: 'srv/', app: 'app/' }

// Conventions that CAP does not configure
const CONVENTIONS = {
  hdiSource: 'src',                                   // HDI artifacts: <db>/src/**/*.hdb* when no .hdiconfig marks the folder
  seedData: ['<db>/data', '<db>/csv', 'test/data'],   // CSV seed data folders
  ignored: ['xmpls'],                                 // sample folders skipped by the CDS file and test scans (cap-sflight)
}

// HDI source folders: every folder with a .hdiconfig (the HDI deployer's own marker), outside
// node_modules and build output (gen/); else <db>/src
function hdiDirs(root, db) {
  const out = []
  const visit = (d, depth) => {
    if (depth > 6 || !fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isFile() && e.name === '.hdiconfig') out.push(d)
      if (e.isDirectory() && !['node_modules', 'gen'].includes(e.name) && !e.name.startsWith('.')) visit(path.join(d, e.name), depth + 1)
    }
  }
  visit(root, 0)
  // a .hdiconfig inside another HDI folder only configures its subtree; keep the outermost
  const top = out.filter(d => !out.some(o => o !== d && d.startsWith(o + path.sep)))
  return top.length ? top : [path.join(root, db, CONVENTIONS.hdiSource)]
}

const trim = f => String(f).replace(/\/+$/, '')
const cache = new Map()

function layout(root) {
  root = path.resolve(root)
  if (cache.has(root)) return cache.get(root)
  let folders = DEFAULT_FOLDERS, source = 'CAP defaults'
  try {
    const env = require('@sap/cds').env.for('cds', root)
    if (env.folders) { folders = { ...DEFAULT_FOLDERS, ...env.folders }; source = 'cds.env.folders' }
  } catch {}
  const db = trim(folders.db), srv = trim(folders.srv), app = trim(folders.app)
  const abs = rel => path.join(root, rel)
  const L = {
    root, db, srv, app, source,
    // CDS model: compiled from these folders, in this order (the order decides the CSN order)
    modelDirs: [db, srv, app].map(abs),
    // CDS sources scanned as text (annotation locations, file dependencies), searched in this order
    cdsSourceDirs: [app, srv, db].map(abs),
    // service implementations (.js/.ts); files outside are only found through @impl
    handlerDirs: [srv].map(abs),
    // UI5 projects: <app> plus extra folders passed with --ui
    uiRoots: (extra = []) => [app, ...extra].map(abs),
    hdiDir: path.join(abs(db), CONVENTIONS.hdiSource),
    hdiDirs: () => hdiDirs(root, db),
    seedDirs: CONVENTIONS.seedData.map(d => abs(d.replace('<db>', db))),
    ignored: CONVENTIONS.ignored,
    // layer of a CDS file from its path relative to the root: app, srv, db, or ext (packages, other folders)
    layerOf: rel => rel.startsWith(app + '/') ? 'app' : rel.startsWith(srv + '/') ? 'srv' : rel.startsWith(db + '/') ? 'db' : 'ext',
    // globs for cds lint, relative to the root
    lintGlobs: [db, srv, app].map(d => `${d}/**/*.cds`),
  }
  cache.set(root, L)
  return L
}

module.exports = { layout, DEFAULT_FOLDERS, CONVENTIONS }
