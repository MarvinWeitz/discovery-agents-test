// Finds what to analyse in a cloned repo: node detect.js <repo-dir> [app-path] [ui-paths]
// app-path and ui-paths are relative to the repo root; empty means "detect".
// Prints key=value lines for $GITHUB_OUTPUT:
//   app        CAP project folder, relative to the repo root ('.' for the root)
//   ui         UI5 project folders outside <app>/app, relative to the app folder (comma list, for --ui);
//              ui-paths "-" means none
//   install    folder to run the package manager in (nearest lockfile at or above the app)
//   pm         npm | yarn | pnpm
//   ts         true when the app has TypeScript handlers
//   typer      true when the app uses @cap-js/cds-typer
//   jest       true when the app brings its own Jest
//   curated    curated/<file>.json whose META.app names this repo, if any
//   mockauth   true when the app only configures token auth (xsuaa, ias, jwt) and so cannot start in a test
//              without a bound instance; the workflow then runs the tests with CAP's mocked users
const fs = require('fs')
const path = require('path')

const [repoDir, appArg = '', uiArg = '', slug = ''] = process.argv.slice(2)
const repo = path.resolve(repoDir)
const skip = new Set(['node_modules', '.git', 'gen', 'dist', 'mta_archives', 'resources'])
const walk = (dir, depth = 0, acc = []) => {
  if (depth > 6) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || skip.has(e.name) || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    acc.push(p)
    walk(p, depth + 1, acc)
  }
  return acc
}
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const deps = pj => ({ ...pj?.dependencies, ...pj?.devDependencies })
const dirs = [repo, ...walk(repo)]

const isCap = d => {
  const pj = readJson(path.join(d, 'package.json'))
  if (!pj) return false
  const cds = '@sap/cds' in deps(pj) || pj.cds
  const model = ['srv', 'db'].some(s => fs.existsSync(path.join(d, s))) || fs.existsSync(path.join(d, '.cdsrc.json'))
  return Boolean(cds && model)
}
let app
if (appArg) {
  app = path.resolve(repo, appArg)
  if (!fs.existsSync(path.join(app, 'package.json'))) throw new Error(`app_path ${appArg} has no package.json`)
} else {
  // shallowest CAP project wins; among equals the one with a srv folder
  const caps = dirs.filter(isCap).sort((a, b) => a.split(path.sep).length - b.split(path.sep).length || fs.existsSync(path.join(b, 'srv')) - fs.existsSync(path.join(a, 'srv')))
  if (!caps.length) throw new Error('No CAP Node.js project found (a package.json with @sap/cds next to srv/ or db/). Set the app_path input.')
  app = caps[0]
}

let install = app
for (let d = app; d.startsWith(repo); d = path.dirname(d)) {
  if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json'].some(f => fs.existsSync(path.join(d, f)))) { install = d; break }
  // npm/yarn workspaces root that includes the app (monorepo without a lockfile, e.g. capire/samples)
  const ws = readJson(path.join(d, 'package.json'))?.workspaces
  const globs = Array.isArray(ws) ? ws : ws?.packages || []
  if (d !== app && globs.some(g => { const rel = path.relative(d, app); return g === rel || g === '*' && !rel.includes(path.sep) || (g.endsWith('/*') && path.dirname(rel) === g.slice(0, -2)) })) { install = d; break }
  if (d === repo) break
}

let ui
if (uiArg === '-') ui = []
else if (uiArg) ui = uiArg.split(',').map(s => s.trim()).filter(Boolean).map(u => path.relative(app, path.resolve(repo, u)))
else {
  // UI5 projects the pipeline would not find on its own (it scans <app>/app)
  const own = path.join(app, 'app') + path.sep
  // only inside the project that gets installed: a repo of exercises holds many unrelated UIs
  ui = dirs.filter(d => fs.existsSync(path.join(d, 'webapp', 'manifest.json')) && !(d + path.sep).startsWith(own) && (d + path.sep).startsWith(install + path.sep))
    .map(d => path.relative(app, d))
}

const pm = fs.existsSync(path.join(install, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(install, 'yarn.lock')) ? 'yarn' : 'npm'

const pj = readJson(path.join(app, 'package.json'))
const d = deps(pj)
const srv = path.join(app, 'srv')
const ts = fs.existsSync(srv) && walk(srv).concat(srv).some(x => fs.readdirSync(x).some(f => f.endsWith('.ts') && !f.endsWith('.d.ts')))

const [owner, name] = slug.split('/')
let curated = ''
for (const f of fs.readdirSync(path.join(__dirname, '../../curated')).filter(f => f.endsWith('.json'))) {
  const c = readJson(path.join(__dirname, '../../curated', f))
  if (owner && String(c?.META?.app).toLowerCase() === `${owner}/${name}`.toLowerCase()) curated = `curated/${f}`
}

// cds.requires.auth in package.json or .cdsrc.json, ignoring [profile] sections that set their own
const rc = readJson(path.join(app, '.cdsrc.json'))
const req = { ...pj?.cds?.requires, ...rc?.requires }
const kindOf = a => typeof a === 'string' ? a : a?.kind
const devAuth = ['[development]', '[test]'].some(p => kindOf(req[p]?.auth) || req.auth?.[p])
const mockauth = /^(xsuaa|ias|jwt)$/.test(kindOf(req.auth) || '') && !devAuth

const out = {
  app: path.relative(repo, app) || '.',
  ui: ui.join(','),
  install: path.relative(repo, install) || '.',
  pm,
  ts: String(ts),
  typer: String('@cap-js/cds-typer' in d),
  jest: String('jest' in d),
  curated,
  mockauth: String(mockauth)
}
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`)
