// Atlas section AUT · Authorization: role heatmap, PII reach, role chain. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { piiFields, short } = require('../../analyse/authz')
const { uniq } = require('../util')

function aut(g, auth) {
  const ROLES = auth.users.map(u => [u.id, u.anon ? 'anonymous' : `${u.id} · ${u.roles.filter(r => g.nodes.has(`role:${r}`)).join(', ') || 'no role'}${u.tested ? ' · tests' : ''}`])
  const AUTH = auth.rows.map(r => ({ op: r.op, svc: r.service, ev: r.ev, note: r.note, c: r.c.map(c => (c.t ? { v: c.v, t: 1 } : c.v)) }))
  // every READ path into personal data
  const piiEnt = new Map(g.byType('Entity').filter(n => piiFields(n).length).map(n => [n.id, n]))
  const ep = []
  for (const r of auth.rows.filter(r => r.token === 'READ' && r.entity)) {
    const sn = g.nodes.get(`svcentity:${r.entity}`); if (!sn) continue
    const path = (g.byType('Service').find(s => s.props.name === sn.props.service)?.props.path || '') + '/' + short(sn.id)
    const dbId = g.out(sn.id, 'projects_on')[0]?.to
    if (piiEnt.has(dbId)) ep.push({ path, ent: short(dbId), via: 'direct', c: r.c.map(c => c.v) })
    for (const a of g.out(dbId || '', 'associates').filter(a => piiEnt.has(a.to))) ep.push({ path: `${path}?$expand=${a.props.element}`, ent: short(a.to), via: 'expand', c: r.c.map(c => c.v) })
  }
  const PIIREACH = { users: ROLES.map(r => r[1]), endpoints: ep.slice(0, 8), entities: uniq(ep.map(e => e.ent)).map(n => [n, piiFields(piiEnt.get([...piiEnt.keys()].find(k => short(k) === n)))]) }
  // users → roles → grants
  const grants = g.edges.filter(e => e.rel === 'requires')
  const appRoles = uniq(grants.map(e => short(e.to)).filter(r => !['any', 'authenticated-user', 'system-user'].includes(r)))
  const G = {}
  for (const e of grants) { const k = `${e.props.grant === '*' ? 'all ops' : String(e.props.grant).split(',').join(' · ')} ${short(e.from)}`; (G[k] ||= { label: k, roles: [], ev: e.evidence }).roles.push(short(e.to)) }
  const openN = auth.rows.filter(r => r.c[0].v !== 'n' && !r.note).length
  const CHAIN = { users: auth.users.filter(u => !u.anon).map(u => [u.id, u.roles.filter(r => appRoles.includes(r)), u.tested ? 1 : 0]), roles: appRoles,
    grants: [...Object.values(G).map(x => [x.label, uniq(x.roles)]), ...(openN ? [[`${openN} operations need no role`, ['any']]] : [])] }
  return { ROLES, AUTH, PIIREACH, CHAIN }
}

module.exports = { aut }
