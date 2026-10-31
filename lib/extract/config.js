// Step 5b · Configuration: remote services and message brokers from cds.requires, deployment
// descriptors, xs-security scopes, HDI artifacts. Walkthrough: docs/walkthrough/05-other-extractors.md
// Sources: docs/walkthrough/references.md (Configuration)
const fs = require('fs')
const path = require('path')
const { walk, lineOf } = require('../project/files')
const { layout } = require('../project/layout')
const config = require('../project/config')
const { cap } = require('../project/cap')

// Remote API or message broker: decided by the implementation CAP resolved for the entry's kind
// (cds.env merges cds.requires.kinds: odata, rest, hcql -> @sap/cds/srv/remote-service.js; enterprise-messaging,
// kafka, file-based-messaging, ... -> a .../messaging/... module). The kind-name patterns below only
// when the entry has no resolved impl (probe failed).
const REMOTE_IMPL = /remote-service|[\\/]remote[\\/]/
const BROKER_IMPL = /messaging/i
const REMOTE_KINDS = /odata|rest|hcql/
const BROKER_KINDS = /messaging|event-mesh|enterprise-messaging|kafka|redis/
// cds.requires entries that CAP itself adds or that configure the runtime, not a service the app talks to
const NOT_SERVICES = ['db', 'auth', 'queue', 'middlewares', 'scheduling', 'kinds', 'outbox']

function extractConfig(root, g) {
  const found = {}
  // Remote services and brokers: cds.requires as CAP resolves it (all config files, profiles, plugins,
  // shorthand kinds), development and production merged; production's kind wins, since that is what
  // the app talks to when deployed. The config file text only supplies the file:line evidence.
  const texts = config.files(root, config.FILES.map(f => f.file).concat(config.TEXT_ONLY))
  const evidence = name => { for (const { file, raw } of texts) for (const n of [`"${name}"`, `${name}:`]) if (raw.includes(n)) return `${file}:${lineOf(raw, n)}`; return 'cds env' }
  const c = cap(root)
  const req = c.requires ? { ...c.requires } : null
  if (req) for (const [name, r] of Object.entries(c.production?.requires || {})) req[name] = typeof r === 'object' && typeof req[name] === 'object' ? { ...req[name], ...r } : r
  const fromFile = config.files(root, ['package.json'])[0]?.json || {}
  found.dependencies = { ...fromFile.dependencies, ...fromFile.devDependencies }
  for (const [name, c0] of Object.entries(req || fromFile.cds?.requires || {})) {
    const cfg = typeof c0 === 'string' ? { kind: c0 } : c0 // "ReviewsService": "hcql" is short for { kind: "hcql" }
    if (!cfg || typeof cfg !== 'object' || NOT_SERVICES.includes(name)) continue
    const impl = typeof cfg.impl === 'string' ? cfg.impl : null
    const remote = impl ? REMOTE_IMPL.test(impl) || cfg.external === true : REMOTE_KINDS.test(cfg.kind || '') || cfg.external === true
    if (remote) {
      g.node(`remote:${name}`, 'ExternalService', { name, kind: cfg.kind, model: cfg.model, destination: cfg.credentials?.destination }, { evidence: evidence(name), source: 'tool:config' })
      // a service of this app's own model that production reaches remotely (modulith / reuse service)
      if (g.nodes.has(`service:${name}`)) { g.nodes.get(`service:${name}`).props.remote = cfg.kind; g.edge(`service:${name}`, 'served_remotely_as', `remote:${name}`, {}, { evidence: evidence(name), source: 'tool:config' }) }
    }
    if (!remote && (impl ? BROKER_IMPL.test(impl) : BROKER_KINDS.test(cfg.kind || name))) g.node(`messaging:${name}`, 'MessagingBroker', { name, kind: cfg.kind }, { evidence: evidence(name), source: 'tool:config' })
  }
  found.plugins = Object.keys(found.dependencies).filter(d => d.startsWith('@cap-js/') || d.startsWith('@sap/cds-'))
  for (const f of config.DESCRIPTORS) if (fs.existsSync(path.join(root, f))) found[f] = true
  const xsSec = path.join(root, 'xs-security.json')
  if (fs.existsSync(xsSec)) {
    for (const s of JSON.parse(fs.readFileSync(xsSec, 'utf8')).scopes || []) g.node(`role:${s.name.replace(/^\$XSAPPNAME\./, '')}`, 'Role', { name: s.name, xsuaa: true }, { evidence: 'xs-security.json:1', source: 'tool:config' })
  }
  const hdi = layout(root).hdiDirs().flatMap(d => walk(d, p => /\.(hdb\w+)$/.test(p)))
  for (const h of hdi) {
    const rel = path.relative(root, h)
    g.node(`dbartifact:${rel}`, 'DbArtifact', { file: rel, kind: path.extname(h).slice(1) }, { evidence: `${rel}:1`, source: 'tool:config' })
  }
  found.hdiArtifacts = hdi.length
  return found
}

module.exports = { extractConfig }
