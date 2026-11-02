// From the stress corpus (seeds config-dummy-auth-production, config-mocked-auth-production,
// config-mocked-auth-no-production-override): the effective production configuration (cds.env with the
// production profile, all config files merged) uses dummy, mocked or basic authentication. With dummy auth every
// request is privileged; with mocked/basic, anyone who knows a configured user name (often with an empty
// password) is that user. A top-level cds.requires.auth with users, without a [production] override, stays mocked
// in production (checked with cds.env).
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')
const TOOLKIT = path.join(__dirname, '..', '..', '..')
const WEAK = ['dummy', 'mocked', 'basic', 'mock']
module.exports = {
  key: 'auth-not-for-production',
  title: 'Production profile authenticates with dummy, mocked or basic auth',
  status: 'draft',
  from: 'stress corpus (2026-11-01): auth configuration per profile',
  i: 5, l: 3, lay: 'Config',
  test: 'Run with NODE_ENV=production and request a protected entity without a token: expect 401, not 200.',
  // what CAP itself computes for production (the app's own @sap/cds when installed, else the toolkit's)
  production(root) {
    const script = `const p=[process.cwd(),${JSON.stringify(TOOLKIT)}];const cds=require(require.resolve('@sap/cds',{paths:p}));const a=cds.env.requires.auth;process.stdout.write(JSON.stringify(typeof a==='string'?{kind:a}:a&&{kind:a.kind,users:Object.keys(a.users||{})}))`
    const r = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, NODE_ENV: 'production', CDS_ENV: '' } })
    try { return JSON.parse(r.stdout) } catch { return null }
  },
  detect({ root, files }) {
    if (!root || !fs.existsSync(path.join(root, 'package.json'))) return []
    const a = this.production(root)
    if (!a || !WEAK.includes(a.kind)) return []
    // evidence: where the auth setting is written (package.json, .cdsrc.json, .cdsrc.yaml)
    let ev = 'package.json:1'
    for (const f of ['package.json', '.cdsrc.json', '.cdsrc.yaml']) {
      const p = path.join(root, f); if (!fs.existsSync(p)) continue
      const lines = fs.readFileSync(p, 'utf8').split('\n')
      const i = lines.findIndex(l => new RegExp(`["']?(\\[prod\\w*\\])`).test(l) && /auth|requires/.test(lines.slice(lines.indexOf(l), lines.indexOf(l) + 3).join(' ')))
      const j = i >= 0 ? i : lines.findIndex(l => /["']?auth["']?\s*:/.test(l))
      if (j >= 0) { ev = `${f}:${j + 1}`; break }
    }
    return [{ ev, t: `Production uses ${a.kind} authentication`, d: `With the production profile CAP resolves cds.requires.auth to kind "${a.kind}"${a.users?.length ? ` with the users ${a.users.slice(0, 5).join(', ')}` : ''}. ${a.kind === 'dummy' ? 'Every request then runs as a privileged user; @requires and @restrict are void.' : 'Anyone who knows a configured user name (and password, often empty) logs in as that user.'} Put mock users under [development] and use xsuaa, ias or jwt for [production].` }]
  }
}
