// Repairs two install problems that stop an app from starting in tests, without touching its package.json:
// 1. Several copies of @sap/cds: CAP needs one instance per process. A workspace package that pins older
//    peers (bookstore's bookshop: @cap-js/sqlite 2 wants cds 9) gets its own nested cds, and its handlers
//    then see an empty model ("cds.entities is not a function"). Nested copies become links to the app's.
// 2. Dependencies that installed packages declare but npm did not install: some published lockfiles lose a
//    package's "dependencies" (Poetry Slam: logform without fecha), so `npm ci` prunes them. These are
//    printed as name@range lines for the workflow to add to the test runtime.
//   node repair-install.js <app-dir> <install-root>
const fs = require('fs')
const path = require('path')

const app = path.resolve(process.argv[2] || '.')
const root = path.resolve(process.argv[3] || app)
const log = m => console.error(`[repair-install] ${m}`)

// 1. one @sap/cds
let cds
try { cds = path.dirname(require.resolve('@sap/cds/package.json', { paths: [app] })) } catch {}
if (cds) {
  const walk = (dir, depth) => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      const sub = path.join(dir, e.name)
      if (e.name === 'node_modules') {
        const copy = path.join(sub, '@sap', 'cds')
        if (fs.existsSync(path.join(copy, 'package.json')) && fs.realpathSync(copy) !== fs.realpathSync(cds)) {
          const v = JSON.parse(fs.readFileSync(path.join(copy, 'package.json'), 'utf8')).version
          fs.rmSync(copy, { recursive: true, force: true })
          fs.symlinkSync(cds, copy, 'dir')
          log(`${path.relative(root, copy)} ${v} now links to ${path.relative(root, cds)}`)
        }
      } else if (depth < 3) walk(sub, depth + 1)
    }
  }
  walk(root, 0)
}

// 2. missing dependencies
const found = new Map()
const exists = (from, name) => {
  for (let d = from; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'node_modules', name, 'package.json'))) return true
    if (d === path.dirname(d)) return false
  }
}
const visit = dir => {
  let pj
  try { pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { return }
  const optional = { ...pj.optionalDependencies, ...pj.peerDependencies }
  for (const [name, range] of Object.entries(pj.dependencies || {})) {
    if (name in optional || /^(file|link|workspace|git|github|https?):/.test(range)) continue
    if (!exists(dir, name) && !found.has(name)) found.set(name, range)
  }
  modulesIn(path.join(dir, 'node_modules'))
}
const modulesIn = nm => {
  let entries = []
  try { entries = fs.readdirSync(nm, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (e.name.startsWith('@')) { for (const s of fs.readdirSync(path.join(nm, e.name))) visit(path.join(nm, e.name, s)) }
    else if (e.isDirectory()) visit(path.join(nm, e.name))
  }
}
// the app's own node_modules and those of the folders above it (workspace roots)
for (let d = app; ; d = path.dirname(d)) {
  modulesIn(path.join(d, 'node_modules'))
  if (d === path.dirname(d)) break
}
if (found.size) log(`declared but not installed: ${[...found.keys()].join(', ')}`)
for (const [name, range] of found) console.log(`${name}@${range}`)
