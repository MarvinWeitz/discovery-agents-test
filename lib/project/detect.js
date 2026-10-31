// Step 1 · Finds what to analyse in a cloned repo: the CAP app folder, where to install, extra UI5
// projects, the package manager and the flags later steps need. Used by .github/scripts/detect.js.
// Every rule below is a guess about an unknown repo; each can be overridden by the workflow inputs
// app_path and ui_paths. Walkthrough: docs/walkthrough/01-intake.md
const fs = require('fs')
const path = require('path')
const { readJson } = require('./files')
const { layout } = require('./layout')
const { cap } = require('./cap')

// Folders never searched for an app, and how deep the search goes
const SKIP_DIRS = new Set(['node_modules', '.git', 'gen', 'dist', 'mta_archives', 'resources'])
const MAX_DEPTH = 6
// The install runs where the nearest of these is, at or above the app
const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json']
// Auth kinds that need a bound service instance to start, and the profiles that usually replace them locally
const TOKEN_AUTH = /^(xsuaa|ias|jwt)$/
const DEV_PROFILES = ['[development]', '[test]']

const deps = pj => ({ ...pj?.dependencies, ...pj?.devDependencies })

// All folders below repo (not files), breadth as listed by the file system
function folders(dir, depth = 0, acc = []) {
  if (depth > MAX_DEPTH) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    acc.push(p)
    folders(p, depth + 1, acc)
  }
  return acc
}

// A CAP project: package.json that depends on @sap/cds (or has a "cds" section), next to its srv or db
// folder (names from its cds config) or a .cdsrc.json
function isCapProject(d) {
  const pj = readJson(path.join(d, 'package.json'))
  if (!pj) return false
  const cds = '@sap/cds' in deps(pj) || pj.cds
  if (!cds) return false
  const L = layout(d)
  return [L.srv, L.db].some(s => fs.existsSync(path.join(d, s))) || fs.existsSync(path.join(d, '.cdsrc.json'))
}

// Shallowest CAP project wins; among equals the one with a srv folder
function findApp(repo, dirs) {
  const hasSrv = d => fs.existsSync(path.join(d, layout(d).srv))
  const caps = dirs.filter(isCapProject).sort((a, b) => a.split(path.sep).length - b.split(path.sep).length || hasSrv(b) - hasSrv(a))
  if (!caps.length) throw new Error('No CAP Node.js project found (a package.json with @sap/cds next to srv/ or db/). Set the app_path input.')
  return caps[0]
}

// Nearest folder at or above the app with a lockfile, or an npm/yarn workspaces root that lists the app
function installRoot(repo, app) {
  for (let d = app; d.startsWith(repo); d = path.dirname(d)) {
    if (LOCKFILES.some(f => fs.existsSync(path.join(d, f)))) return d
    // monorepo without a lockfile, e.g. capire/samples; understood globs: exact path, *, dir/*
    const ws = readJson(path.join(d, 'package.json'))?.workspaces
    const globs = Array.isArray(ws) ? ws : ws?.packages || []
    if (d !== app && globs.some(g => { const rel = path.relative(d, app); return g === rel || g === '*' && !rel.includes(path.sep) || (g.endsWith('/*') && path.dirname(rel) === g.slice(0, -2)) })) return d
    if (d === repo) break
  }
  return app
}

// UI5 projects (webapp/manifest.json) the pipeline would not find on its own (it scans <app>/<app folder>),
// only inside the project that gets installed: a repo of exercises holds many unrelated UIs
function uiProjects(dirs, app, install) {
  const own = path.join(app, layout(app).app) + path.sep
  return dirs.filter(d => fs.existsSync(path.join(d, 'webapp', 'manifest.json')) && !(d + path.sep).startsWith(own) && (d + path.sep).startsWith(install + path.sep))
    .map(d => path.relative(app, d))
}

const packageManager = install => fs.existsSync(path.join(install, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(install, 'yarn.lock')) ? 'yarn' : 'npm'

// TypeScript handlers: any .ts (not .d.ts) in the srv folder or below
function hasTypeScript(app) {
  const srv = path.join(app, layout(app).srv)
  return fs.existsSync(srv) && folders(srv).concat(srv).some(x => fs.readdirSync(x).some(f => f.endsWith('.ts') && !f.endsWith('.d.ts')))
}

// curated/<file>.json whose META.app is owner/repo (case-insensitive)
function curatedFor(slug, dir) {
  const [owner, name] = slug.split('/')
  let found = ''
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const c = readJson(path.join(dir, f))
    if (owner && String(c?.META?.app).toLowerCase() === `${owner}/${name}`.toLowerCase()) found = `curated/${f}`
  }
  return found
}

// Token-only auth (xsuaa, ias, jwt) in the test profile: the app cannot start in a test without a bound
// instance, so the workflow runs it with CAP's mocked users. CAP decides the auth kind (cds.env with
// NODE_ENV=test: all config files, profiles, env variables); the text rule below only when CAP cannot be asked.
function needsMockAuth(app) {
  const kind = cap(app).test?.requires?.auth?.kind
  if (kind) return TOKEN_AUTH.test(kind)
  return needsMockAuthFromText(app)
}

// Reads cds.requires in package.json and .cdsrc.json (later wins), not .cdsrc.yaml or env variables
function needsMockAuthFromText(app) {
  const pj = readJson(path.join(app, 'package.json'))
  const rc = readJson(path.join(app, '.cdsrc.json'))
  const req = { ...pj?.cds?.requires, ...rc?.requires }
  const kindOf = a => typeof a === 'string' ? a : a?.kind
  const devAuth = DEV_PROFILES.some(p => kindOf(req[p]?.auth) || req.auth?.[p])
  return TOKEN_AUTH.test(kindOf(req.auth) || '') && !devAuth
}

// appArg / uiArg are relative to the repo root; empty means detect, uiArg '-' means none
function detect(repoDir, { appArg = '', uiArg = '', slug = '', curatedDir }) {
  const repo = path.resolve(repoDir)
  const dirs = [repo, ...folders(repo)]
  let app
  if (appArg) {
    app = path.resolve(repo, appArg)
    if (!fs.existsSync(path.join(app, 'package.json'))) throw new Error(`app_path ${appArg} has no package.json`)
  } else app = findApp(repo, dirs)
  const install = installRoot(repo, app)
  const ui = uiArg === '-' ? [] : uiArg ? uiArg.split(',').map(s => s.trim()).filter(Boolean).map(u => path.relative(app, path.resolve(repo, u))) : uiProjects(dirs, app, install)
  const d = deps(readJson(path.join(app, 'package.json')))
  return {
    app: path.relative(repo, app) || '.',
    ui: ui.join(','),
    install: path.relative(repo, install) || '.',
    pm: packageManager(install),
    ts: String(hasTypeScript(app)),
    typer: String('@cap-js/cds-typer' in d),
    jest: String('jest' in d),
    curated: curatedFor(slug, curatedDir),
    mockauth: String(needsMockAuth(app))
  }
}

module.exports = { detect, isCapProject, findApp, installRoot, uiProjects, packageManager, hasTypeScript, curatedFor, needsMockAuth, SKIP_DIRS, MAX_DEPTH, LOCKFILES, TOKEN_AUTH, DEV_PROFILES }
