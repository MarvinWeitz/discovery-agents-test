#!/usr/bin/env node
// CAP probe: asks CAP itself how it sees the project, the way `cds env`, `cds resolve`,
// `cds compile --to serviceinfo` and `cds deploy` would. Runs in its own process with cds.root = the
// app, so the app's own @sap/cds (when installed), its plugins and its profiles decide, and nothing
// leaks into the pipeline's process. Prints one JSON object. Called by lib/project/cap.js.
//   node lib/project/probe.js <app-root> [csn-out.json]
// Walkthrough: docs/walkthrough/00-assumptions.md · Sources (CAP docs, @sap/cds files): docs/walkthrough/references.md
const fs = require('fs')
const path = require('path')

const root = path.resolve(process.argv[2] || '.')
process.chdir(root)

// The app's own @sap/cds if it is installed (what `cds watch` would use), else the toolkit's
let cds, from = 'app'
try { cds = require(require.resolve('@sap/cds', { paths: [root] })) } catch { cds = require('@sap/cds'); from = 'toolkit' }
cds.root = root
const rel = f => path.relative(root, f).split(path.sep).join('/')
const errors = []
const attempt = (what, fn, fallback) => { try { return fn() } catch (e) { errors.push(`${what}: ${e.message.split('\n')[0]}`); return fallback } }

// cds.requires as CAP resolved it, without credentials (they can hold secrets)
function requires(env) {
  const out = {}
  for (const [name, r] of Object.entries(env.requires || {})) {
    if (name === 'kinds' || !r || typeof r !== 'object') { if (name !== 'kinds') out[name] = r; continue }
    const { credentials, ...rest } = r
    out[name] = JSON.parse(JSON.stringify(rest, (k, v) => typeof v === 'function' ? undefined : v))
    if (credentials) out[name].credentials = Object.keys(credentials)
  }
  return out
}

function envFor(profile) {
  const saved = { NODE_ENV: process.env.NODE_ENV, CDS_ENV: process.env.CDS_ENV }
  delete process.env.CDS_ENV
  if (profile) process.env.NODE_ENV = profile; else delete process.env.NODE_ENV
  try { return cds.env.for('cds', root) } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v }
}

// Service implementation as cds.serve finds it (@sap/cds lib/srv/factory.js):
// @impl, else <cds file name>.js|.mjs (and .ts in a TypeScript run) next to the .cds file or in its lib/ or handlers/ folder,
// else cds.requires.<service>.impl
function implOf(name, def, env, ts) {
  const src = def['@source'] || def.$location?.file
  const exts = ts ? ['.ts', '.js', '.mjs'] : ['.js', '.mjs']
  const exists = f => { for (const c of [f, ...exts.map(e => f.replace(/\.(js|ts|mjs)$/, '') + e)]) if (/\.(js|ts|mjs)$/.test(c) && fs.existsSync(c) && fs.statSync(c).isFile()) return c }
  const impl = def['@impl']
  if (typeof impl === 'string') {
    const f = impl.startsWith('./') && src ? path.resolve(root, path.dirname(src), impl) : path.resolve(root, impl)
    return { file: exists(f), rule: '@impl', declared: impl }
  }
  if (src) {
    const { dir, name: base } = path.parse(path.resolve(root, src))
    for (const sub of ['', 'lib', 'handlers']) for (const e of exts) {
      const f = path.join(dir, sub, base + e)
      if (fs.existsSync(f)) return { file: f, rule: sub ? `sibling ${sub}/` : 'sibling' }
    }
  }
  const r = env.requires?.[name]?.impl
  if (typeof r === 'string') return { file: exists(path.resolve(root, r)), rule: 'cds.requires.impl', declared: r }
  return null
}

// Profiles the app names anywhere in its config ("[production]", "[hybrid]", ...): CAP keeps them in
// env.profiles only for the active run, so the raw config sources are scanned for the names, and each
// profile is then resolved by CAP itself
function declaredProfiles() {
  const names = new Set(['development', 'production', 'test'])
  const scan = o => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const m = /^\[(.+)\]$/.exec(k); if (m) m[1].split(',').forEach(n => names.add(n.trim())); scan(v) } }
  for (const f of ['package.json', '.cdsrc.json'].filter(f => fs.existsSync(path.join(root, f)))) attempt(f, () => { const j = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); scan(f === 'package.json' ? j.cds : j) })
  return [...names]
}

function dbPerProfile() {
  const out = {}
  for (const p of declaredProfiles()) attempt(`profile ${p}`, () => {
    const db = envFor(p).requires?.db
    if (db) out[p] = { kind: db.kind || null, model: db.model ? [].concat(db.model) : null, impl: typeof db.impl === 'string' ? db.impl : null }
  })
  return out
}

async function main() {
  const env = envFor(null), prod = attempt('production profile', () => envFor('production'), null), test = attempt('test profile', () => envFor('test'), null)
  const ts = !!env.typer || fs.existsSync(path.join(root, 'tsconfig.json'))
  const out = {
    cds: { version: cds.version, from, home: rel(cds.home) },
    profiles: env.profiles,
    folders: env.folders,
    roots: env.roots,
    requires: requires(env),
    production: prod && { profiles: prod.profiles, requires: requires(prod) },
    test: test && { profiles: test.profiles, requires: requires(test) },   // what cds.test under Jest (NODE_ENV=test) sees
    plugins: Object.keys(env.plugins || {}),
    // where each plugin's cds-plugin.js lives (@sap/cds lib/plugins.js fetch: dependencies, plus
    // devDependencies outside production); realpath, so a workspace package shows its own folder
    pluginImpls: Object.fromEntries(Object.entries(env.plugins || {}).filter(([, p]) => typeof p?.impl === 'string').map(([n, p]) => { let f = p.impl; try { f = fs.realpathSync(f) } catch {} return [n, rel(f)] })),
    // the database every profile the app declares gets, as cds.env resolves it (kind, model folders, credentials stripped)
    db: dbPerProfile(env),
    typescript: ts,
  }
  const files = attempt('cds.resolve', () => cds.resolve('*', { root }) || [], [])
  out.model = { files: files.map(rel) }
  const csn = await cds.load(files.length ? files : '*', { locations: true }).catch(e => { errors.push(`cds.load: ${e.message.split('\n')[0]}`); return null })
  if (csn) {
    out.model.sources = csn.$sources.map(rel)
    // the compiled model itself, so the pipeline uses the app's own compiler instead of compiling again
    if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ ...csn, $sources: csn.$sources }))
    // OData $metadata per service, as the UI receives it (CAP adds annotations of its own, e.g. for drafts)
    if (process.argv[3]) out.edmx = attempt('edmx', () => {
      const dir = path.join(path.dirname(process.argv[3]), 'edmx'); fs.mkdirSync(dir, { recursive: true })
      const files = {}
      for (const [name, def] of Object.entries(csn.definitions)) if (def.kind === 'service' && !def['@cds.external'] && def['@protocol'] !== 'none') {
        try { const x = cds.compile.to.edmx(csn, { service: name }); const f = path.join(dir, name + '.xml'); fs.writeFileSync(f, x); files[name] = f } catch (e) { errors.push(`edmx ${name}: ${e.message.split('\n')[0]}`) }
      }
      return files
    }, {})
    out.model.compiler = attempt('compiler version', () => require(require.resolve('@sap/cds-compiler/package.json', { paths: [cds.home] })).version, null)
    out.services = attempt('serviceinfo', () => cds.compile.to.serviceinfo(csn, { root }).filter(s => s.runtime !== 'Java').map(s => ({
      name: s.name, endpoints: (s.endpoints || []).map(e => ({ kind: e.kind, path: '/' + e.path.replace(/^\/+|\/+$/g, '') })),
    })), [])
    // database name of every persisted entity, as the app's own compiler names it for HANA (naming mode from
    // cds.sql.names: plain, quoted, hdbcds) -- what native artifacts and native SQL refer to
    out.sqlNames = attempt('sql names', () => {
      const compiler = require(require.resolve('@sap/cds-compiler', { paths: [cds.home] }))
      const mode = env.sql?.names || 'plain', names = {}
      for (const [name, def] of Object.entries(csn.definitions))
        if (def.kind === 'entity' && !def['@cds.external'] && !def['@cds.persistence.skip']) names[name] = compiler.getArtifactCdsPersistenceName(name, mode, csn, 'hana')
      return { mode, names }
    }, null)
    out.impls = {}
    for (const [name, def] of Object.entries(csn.definitions)) if (def.kind === 'service' && !def['@cds.external']) {
      const i = implOf(name, def, env, ts)
      out.impls[name] = i && { ...i, file: i.file ? rel(i.file) : null }
    }
    const res = await cds.deploy.resources(csn, { testdata: true }).catch(e => { errors.push(`cds.deploy.resources: ${e.message.split('\n')[0]}`); return {} })
    out.seed = Object.fromEntries(Object.entries(res).filter(([f]) => !f.includes('node_modules')).map(([f, e]) => [rel(path.resolve(root, f)), e]))
  }
  // cds serve loads server.js (server.ts in a TypeScript run) from the root, else from the srv folder
  // (@sap/cds bin/serve.js _local_server_js); custom bootstrap: cds.on('bootstrap'), middlewares
  const local = f => [f, path.join(env.folders?.srv || 'srv/', f)].find(x => fs.existsSync(path.join(root, x)))
  out.server = (ts && local('server.ts')) || local('server.js') || null
  out.errors = errors
  process.stdout.write(JSON.stringify(out))
}

main().catch(e => { process.stdout.write(JSON.stringify({ errors: [...errors, e.message] })) })
