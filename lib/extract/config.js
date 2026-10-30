// Step 5b · Configuration: remote services and message brokers from cds.requires, deployment
// descriptors, xs-security scopes, HDI artifacts. Walkthrough: docs/walkthrough/05-other-extractors.md
const fs = require('fs')
const path = require('path')
const { walk, lineOf } = require('../project/files')
const { layout } = require('../project/layout')
const config = require('../project/config')

// cds.requires kinds that mean "a remote API" and "a message broker" (matched against kind, broker also against the name)
const REMOTE_KINDS = /odata|rest|hcql/
const BROKER_KINDS = /messaging|event-mesh|enterprise-messaging|kafka|redis/

function extractConfig(root, g) {
  const found = {}
  // remote services and brokers are read from package.json "cds.requires" only; .cdsrc.json is not read here (yet)
  for (const { raw, json: p } of config.files(root, ['package.json'])) {
    found.dependencies = { ...p.dependencies, ...p.devDependencies }
    const req = p.cds?.requires || {}
    for (const [name, c] of Object.entries(req)) {
      const cfg = typeof c === 'string' ? { kind: c } : c // "ReviewsService": "hcql" is short for { kind: "hcql" }
      if (cfg && typeof cfg === 'object' && REMOTE_KINDS.test(cfg.kind || '')) {
        g.node(`remote:${name}`, 'ExternalService', { name, kind: cfg.kind, model: cfg.model, destination: cfg.credentials?.destination }, { evidence: `package.json:${lineOf(raw, `"${name}"`)}`, source: 'tool:config' })
        // a service of this app's own model that production reaches remotely (modulith / reuse service)
        if (g.nodes.has(`service:${name}`)) { g.nodes.get(`service:${name}`).props.remote = cfg.kind; g.edge(`service:${name}`, 'served_remotely_as', `remote:${name}`, {}, { evidence: `package.json:${lineOf(raw, `"${name}"`)}`, source: 'tool:config' }) }
      }
      if (cfg && typeof cfg === 'object' && BROKER_KINDS.test(cfg.kind || name)) {
        g.node(`messaging:${name}`, 'MessagingBroker', { name, kind: cfg.kind }, { evidence: `package.json:${lineOf(raw, `"${name}"`)}`, source: 'tool:config' })
      }
    }
    found.plugins = Object.keys(found.dependencies).filter(d => d.startsWith('@cap-js/') || d.startsWith('@sap/cds-'))
  }
  for (const f of config.DESCRIPTORS) if (fs.existsSync(path.join(root, f))) found[f] = true
  const xsSec = path.join(root, 'xs-security.json')
  if (fs.existsSync(xsSec)) {
    for (const s of JSON.parse(fs.readFileSync(xsSec, 'utf8')).scopes || []) g.node(`role:${s.name.replace(/^\$XSAPPNAME\./, '')}`, 'Role', { name: s.name, xsuaa: true }, { evidence: 'xs-security.json:1', source: 'tool:config' })
  }
  const hdi = walk(layout(root).hdiDir, p => /\.(hdb\w+)$/.test(p))
  for (const h of hdi) {
    const rel = path.relative(root, h)
    g.node(`dbartifact:${rel}`, 'DbArtifact', { file: rel, kind: path.extname(h).slice(1) }, { evidence: `${rel}:1`, source: 'tool:config' })
  }
  found.hdiArtifacts = hdi.length
  return found
}

module.exports = { extractConfig }
