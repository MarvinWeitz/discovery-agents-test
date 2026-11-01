// Test helper for the rules: a small graph and CSN (not a rule; the engine skips files starting with _).
const { Graph } = require('../../../lib/graph')
function graph({ users = {}, xs = [], requires = [], handlers = [], emits = [], subscribes = [] } = {}) {
  const g = new Graph('t')
  for (const [u, roles] of Object.entries(users)) g.node(`user:${u}`, 'MockUser', { name: u, roles, capDefault: false }, { evidence: 'package.json:5' })
  for (const r of xs) g.node(`role:${r}`, 'Role', { name: r, xsuaa: true }, { evidence: 'xs-security.json:3' })
  for (const [from, role, grant] of requires) g.edge(from, 'requires', `role:${role}`, { grant }, { evidence: 'srv/s.cds:4' })
  handlers.forEach(([service, phase, events, extra], i) => g.node(`handler:srv/s.js:${i + 1}`, 'Handler', { service, phase, events, ...extra }, { evidence: `srv/s.js:${i + 1}` }))
  for (const [svc, to] of emits) { g.node(`handler:srv/e.js:1`, 'Handler', { service: svc, phase: 'on', events: ['x'] }, { evidence: 'srv/e.js:1' }); g.edge('handler:srv/e.js:1', 'emits', `event:${to}`, {}, { evidence: 'srv/e.js:3' }) }
  for (const to of subscribes) g.edge('handler:srv/a.js:1', 'subscribes', `event:${to}`, {}, { evidence: 'srv/a.js:6' })
  return g
}
const csn = {
  definitions: {
    S: { kind: 'service' },
    'S.Orders': { kind: 'entity', actions: { approve: { kind: 'action' }, reject: { kind: 'action' } } },
    'S.OrderApproved': { kind: 'event' },
    'S.search': { kind: 'function' },
    Remote: { kind: 'service', '@cds.external': true },
  },
}
module.exports = { graph, csn }
