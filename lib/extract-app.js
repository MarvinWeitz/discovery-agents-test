// UI5, configuration, test inventory and git history extractors.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { walk } = require('./extract-handlers')

const lineOf = (src, needle) => { const i = src.indexOf(needle); return i < 0 ? 1 : src.slice(0, i).split('\n').length }

function extractUI5(root, g, uiDirs = []) {
  // app/ plus UI5 projects that live elsewhere in a monorepo (discover --ui ../ui-form)
  const manifests = ['app', ...uiDirs].flatMap(d => walk(path.join(root, d), p => p.endsWith(path.join('webapp', 'manifest.json')) && !p.includes('node_modules')))
  const services = g.byType('Service')
  for (const mf of manifests) {
    const rel = path.relative(root, mf)
    const raw = fs.readFileSync(mf, 'utf8')
    const m = JSON.parse(raw)
    const appId = m['sap.app']?.id || rel
    const ui5 = m['sap.ui5'] || {}
    const libs = Object.keys(ui5.dependencies?.libs || {})
    const fe = libs.includes('sap.fe.templates')
    const aid = `ui5app:${appId}`
    g.node(aid, 'UI5App', { id: appId, manifest: rel, minUI5Version: ui5.dependencies?.minUI5Version, libs, fioriElements: fe }, { evidence: `${rel}:1`, source: 'tool:ui5' })

    // Data sources -> CAP services by URI
    const dsService = {}
    for (const [dsName, ds] of Object.entries(m['sap.app']?.dataSources || {})) {
      if (ds.type !== 'OData') continue
      const uri = '/' + ds.uri.replace(/^\/|\/$/g, '')
      const svc = services.find(s => uri.endsWith(s.props.path))
      if (svc) {
        dsService[dsName] = svc.props.name
        g.edge(aid, 'uses', svc.id, { dataSource: dsName, odataVersion: ds.settings?.odataVersion }, { evidence: `${rel}:${lineOf(raw, `"${dsName}"`)}`, source: 'tool:ui5' })
      } else {
        g.node(`remote:${uri}`, 'ExternalService', { name: uri })
        g.edge(aid, 'uses', `remote:${uri}`, { dataSource: dsName }, { evidence: `${rel}:${lineOf(raw, `"${dsName}"`)}`, source: 'tool:ui5' })
      }
    }
    const defaultModel = ui5.models?.['']?.dataSource || Object.keys(dsService)[0]
    const svc = dsService[defaultModel]

    // Routes and their targets
    const routing = ui5.routing || {}
    for (const r of routing.routes || []) {
      const rid = `route:${appId}/${r.name}`
      const tname = [].concat(r.target)[0]
      const t = routing.targets?.[tname] || {}
      const settings = t.options?.settings || {}
      const entitySet = settings.entitySet || settings.contextPath?.replace(/^\//, '').split('/')[0]
      g.node(rid, 'Route', { name: r.name, pattern: r.pattern, template: t.name || t.viewName, entitySet }, { evidence: `${rel}:${lineOf(raw, `"name": "${r.name}"`)}`, source: 'tool:ui5' })
      g.edge(aid, 'has_route', rid, {}, { evidence: `${rel}:${lineOf(raw, `"name": "${r.name}"`)}`, source: 'tool:ui5' })
      if (entitySet && svc) g.edge(rid, 'shows', `svcentity:${svc}.${entitySet}`, {}, { evidence: `${rel}:${lineOf(raw, `"entitySet": "${entitySet}"`)}`, source: 'tool:ui5' })
      for (const nav of Object.values(settings.navigation || {})) {
        if (nav.detail?.route) g.edge(rid, 'navigates_to', `route:${appId}/${nav.detail.route}`, {}, { evidence: `${rel}:${lineOf(raw, `"route": "${nav.detail.route}"`)}`, source: 'tool:ui5' })
      }
    }

    // Freestyle views: bindings and event handlers
    const webapp = path.dirname(mf)
    for (const v of walk(webapp, p => p.endsWith('.view.xml') || p.endsWith('.fragment.xml'))) {
      const vrel = path.relative(root, v)
      const src = fs.readFileSync(v, 'utf8')
      const vid = `view:${vrel}`
      g.node(vid, 'View', { file: vrel }, { evidence: `${vrel}:1`, source: 'tool:ui5' })
      g.edge(aid, 'has_view', vid, {}, { evidence: `${vrel}:1`, source: 'tool:ui5' })
      for (const b of src.matchAll(/["{]\s*(?:path\s*:\s*['"])?\/(\w+)/g)) {
        if (svc && g.nodes.has(`svcentity:${svc}.${b[1]}`)) g.edge(vid, 'binds_to', `svcentity:${svc}.${b[1]}`, {}, { evidence: `${vrel}:${src.slice(0, b.index).split('\n').length}`, source: 'tool:ui5', confidence: 'medium' })
      }
      for (const h of src.matchAll(/\b(press|change|select|liveChange|search|submit)="\.?([\w.]+)"/g)) {
        const hid = `uihandler:${vrel}#${h[2]}`
        g.node(hid, 'UIHandler', { event: h[1], method: h[2] }, { evidence: `${vrel}:${src.slice(0, h.index).split('\n').length}`, source: 'tool:ui5', confidence: 'medium' })
        g.edge(vid, 'triggers', hid, {}, { evidence: `${vrel}:${src.slice(0, h.index).split('\n').length}`, source: 'tool:ui5', confidence: 'medium' })
      }
    }
  }
  return { apps: manifests.length }
}

function extractConfig(root, g) {
  const found = {}
  const pj = path.join(root, 'package.json')
  if (fs.existsSync(pj)) {
    const raw = fs.readFileSync(pj, 'utf8')
    const p = JSON.parse(raw)
    found.dependencies = { ...p.dependencies, ...p.devDependencies }
    const req = p.cds?.requires || {}
    for (const [name, cfg] of Object.entries(req)) {
      if (cfg && typeof cfg === 'object' && /odata|rest|hcql/.test(cfg.kind || '')) {
        g.node(`remote:${name}`, 'ExternalService', { name, kind: cfg.kind, model: cfg.model, destination: cfg.credentials?.destination }, { evidence: `package.json:${lineOf(raw, `"${name}"`)}`, source: 'tool:config' })
      }
      if (cfg && typeof cfg === 'object' && /messaging|event-mesh|enterprise-messaging|kafka|redis/.test(cfg.kind || name)) {
        g.node(`messaging:${name}`, 'MessagingBroker', { name, kind: cfg.kind }, { evidence: `package.json:${lineOf(raw, `"${name}"`)}`, source: 'tool:config' })
      }
    }
    found.plugins = Object.keys(found.dependencies).filter(d => d.startsWith('@cap-js/') || d.startsWith('@sap/cds-'))
  }
  for (const f of ['mta.yaml', 'xs-security.json', 'app/router/xs-app.json']) if (fs.existsSync(path.join(root, f))) found[f] = true
  const xsSec = path.join(root, 'xs-security.json')
  if (fs.existsSync(xsSec)) {
    for (const s of JSON.parse(fs.readFileSync(xsSec, 'utf8')).scopes || []) g.node(`role:${s.name.replace(/^\$XSAPPNAME\./, '')}`, 'Role', { name: s.name, xsuaa: true }, { evidence: 'xs-security.json:1', source: 'tool:config' })
  }
  const hdi = walk(path.join(root, 'db', 'src'), p => /\.(hdb\w+)$/.test(p))
  for (const h of hdi) {
    const rel = path.relative(root, h)
    g.node(`dbartifact:${rel}`, 'DbArtifact', { file: rel, kind: path.extname(h).slice(1) }, { evidence: `${rel}:1`, source: 'tool:config' })
  }
  found.hdiArtifacts = hdi.length
  return found
}


// Mock users for local runs and tests: package.json cds.requires.auth (all profiles) and .cdsrc.json,
// falling back to CAP's built-in mocked users when the app defines none.
function extractAuth(root, g, cds) {
  const sources = []
  const pj = path.join(root, 'package.json'), rc = path.join(root, '.cdsrc.json')
  if (fs.existsSync(pj)) sources.push(['package.json', fs.readFileSync(pj, 'utf8'), j => j.cds?.requires])
  if (fs.existsSync(rc)) sources.push(['.cdsrc.json', fs.readFileSync(rc, 'utf8'), j => j.requires])
  const users = {}
  let restrictAll = null, kinds = []
  for (const [file, raw, pick] of sources) {
    const req = pick(JSON.parse(raw)) || {}
    for (const [k, v] of Object.entries(req)) {
      const auth = k === 'auth' ? v : k.startsWith('[') && v?.auth ? v.auth : null
      if (!auth || typeof auth !== 'object') continue
      kinds.push(`${k === 'auth' ? '' : k + ' '}${auth.kind || ''}`.trim())
      if (auth.restrict_all_services !== undefined) restrictAll = auth.restrict_all_services
      for (const [u, d] of Object.entries(auth.users || {})) if (d && typeof d === 'object') users[u] = { roles: d.roles || [], password: d.password, file, line: lineOf(raw, `"${u}"`), profile: k === 'auth' ? null : k }
    }
  }
  // cds.env merges configured users into CAP's built-in mock users (alice, bob, …), so both exist at runtime
  let defaults = false
  if (cds) {
    const env = cds.env.for('cds', root).requires?.auth || {}
    for (const [u, d] of Object.entries(env.users || {})) if (!users[u] && d && typeof d === 'object') { users[u] = { roles: d.roles || [], password: d.password, file: '@sap/cds defaults', line: 0, capDefault: true }; defaults = true }
    restrictAll = env.restrict_all_services ?? restrictAll
  }
  for (const [u, d] of Object.entries(users)) {
    g.node(`user:${u}`, 'MockUser', { name: u, roles: d.roles, profile: d.profile || null, capDefault: !!d.capDefault, ...(d.password ? { password: d.password } : {}) }, { evidence: d.line ? `${d.file}:${d.line}` : d.file, source: 'tool:config' })
    for (const r of d.roles) g.edge(`user:${u}`, 'has_role', `role:${r}`, {}, { evidence: d.line ? `${d.file}:${d.line}` : d.file, source: 'tool:config' })
  }
  for (const x of walk(root, p => p.endsWith('xs-security.json'))) {
    const rel = path.relative(root, x)
    for (const s of JSON.parse(fs.readFileSync(x, 'utf8')).scopes || []) {
      const name = s.name.replace(/^\$XSAPPNAME\./, '')
      g.node(`role:${name}`, 'Role', { name, xsuaa: true, xsSecurity: rel }, { evidence: `${rel}:${lineOf(fs.readFileSync(x, 'utf8'), s.name)}`, source: 'tool:config' })
    }
  }
  return { users: Object.keys(users).length, defaults, restrictAll, kinds }
}

function extractTests(root, g) {
  const tests = walk(root, p => /(\.test|\.spec)\.(js|ts)$/.test(p) || /webapp[\\/]test[\\/].*Journey\.js$/.test(p))
  const entities = g.byType('ServiceEntity')
  for (const t of tests) {
    const rel = path.relative(root, t)
    if (rel.startsWith('xmpls')) continue
    const src = fs.readFileSync(t, 'utf8')
    const cases = (src.match(/\b(it|test|opaTest)\s*\(/g) || []).length
    const tid = `test:${rel}`
    const runsAs = [...new Set([...src.matchAll(/auth\s*[:=]\s*\{\s*username\s*:\s*['"`](\w+)/g), ...src.matchAll(/\.auth\s*\(\s*['"`](\w+)/g)].map(m => m[1]))]
    const names = [...src.matchAll(/\b(?:it|test|opaTest)\s*\(\s*(['"`])(.*?)\1/g)].map(m => m[2])
    g.node(tid, 'ExistingTest', { file: rel, cases, kind: /Journey/.test(rel) ? 'ui-opa5' : 'service', runsAs, names }, { evidence: `${rel}:1`, source: 'tool:tests' })
    for (const u of runsAs) g.edge(tid, 'runs_as', `user:${u}`, {}, { evidence: `${rel}:${lineOf(src, u)}`, source: 'tool:tests' })
    for (const e of entities) {
      const short = e.props.name.split('.').pop()
      if (new RegExp(`\\b${short}\\b`).test(src)) g.edge(tid, 'mentions', e.id, {}, { evidence: `${rel}:${lineOf(src, short)}`, source: 'tool:tests', confidence: 'low' })
    }
  }
}

function extractHistory(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'log', '--numstat', '--format=@%H'], { encoding: 'utf8', maxBuffer: 64 << 20 })
    const churn = {}
    for (const line of out.split('\n')) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
      if (!m) continue
      const c = churn[m[3]] ||= { commits: 0, lines: 0 }
      c.commits++
      c.lines += (+m[1] || 0) + (+m[2] || 0)
    }
    const commits = (out.match(/^@/gm) || []).length
    return { commits, churn }
  } catch { return { commits: 0, churn: {} } }
}

module.exports = { extractUI5, extractConfig, extractAuth, extractTests, extractHistory }
