// Step 5c · Mock users and roles: cds.requires.auth in the config files (all profiles), CAP's built-in
// mocked users, xs-security.json scopes. Walkthrough: docs/walkthrough/05-other-extractors.md
const fs = require('fs')
const path = require('path')
const { walk, lineOf } = require('../project/files')
const config = require('../project/config')
const { cap } = require('../project/cap')

// Mock users for local runs and tests: package.json cds.requires.auth (all profiles) and .cdsrc.json,
// falling back to CAP's built-in mocked users when the app defines none.
function extractAuth(root, g, cds) {
  const users = {}
  let restrictAll = null, kinds = []
  for (const { file, raw, cds: c } of config.files(root)) {
    const req = c.requires || {}
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
  // the effective auth config comes from CAP (the app's own cds version decides the built-in users)
  const effective = cap(root).requires?.auth || (cds && config.env(root, cds)?.requires?.auth)
  if (effective) {
    const env = effective || {}
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

module.exports = { extractAuth }
