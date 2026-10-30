// Authorization matrix from the graph: which mock user may do which operation, derived from
// @requires / @restrict, auto-exposure and CAP's "services without @requires are public" default.
// Cell values: y allowed, n denied, r open (allowed without a role you would expect, and holds personal data),
// a unclear (depends on inheritance or a runtime check; verify with a request).
const PII = /^(first|last|middle|given|family)name$|e-?mail|phone|street|birth|iban|creditcard|ssn|passport|taxid/i
const short = id => String(id).replace(/^[a-z]+:/, '').split('.').pop()

function piiFields(n) { return (n.props.elementNames || []).filter(x => PII.test(x)) }

function grants(g, id) { return g.out(id, 'requires').map(e => ({ role: short(e.to), grant: String(e.props.grant).split(','), where: e.props.where || null, ev: e.evidence })) }

function users(g) {
  const appRoles = new Set(g.edges.filter(e => e.rel === 'requires').map(e => short(e.to)))
  let us = g.byType('MockUser').map(u => ({ id: u.props.name, roles: u.props.roles, capDefault: u.props.capDefault, ev: u.evidence }))
  const tested = new Set(g.edges.filter(e => e.rel === 'runs_as').map(e => short(e.to)))
  // CAP's built-in users: keep one per set of app roles not already covered, plus every one a test uses
  const key = u => u.roles.filter(r => appRoles.has(r)).sort().join(',')
  const seen = new Set(us.filter(u => !u.capDefault).map(key))
  us = us.filter(u => { if (!u.capDefault) return true; if (tested.has(u.id)) { seen.add(key(u)); return true } if (seen.has(key(u))) return false; seen.add(key(u)); return true })
  return [{ id: 'anonymous', roles: [], anon: true }, ...us.map(u => ({ ...u, tested: tested.has(u.id) }))]
}

function matrix(g, meta = {}) {
  const U = users(g)
  const rows = []
  const hits = (u, gs, token) => gs.filter(x => (x.role === 'any' || (!u.anon && x.role === 'authenticated-user') || u.roles.includes(x.role)) && x.grant.some(t => t === '*' || t === token || (token !== 'READ' && t === 'WRITE')))
  const can = (u, gs, token) => hits(u, gs, token).length > 0
  // allowed only through a grant with a where clause: row-level, so 'a' (own rows only)
  const rowOnly = (u, gs, token) => { const h = hits(u, gs, token); return h.length > 0 && h.every(x => x.where) }
  const testedCell = (u, entityId) => g.edges.some(e => e.rel === 'mentions' && e.to === entityId && g.edges.some(r => r.rel === 'runs_as' && r.from === e.from && short(r.to) === u.id))
  for (const s of g.byType('Service')) {
    const sg = grants(g, s.id)
    const svcOk = u => !sg.length || can(u, sg, '*') || can(u, sg, 'READ')
    const exposed = g.out(s.id, 'exposes').map(e => g.nodes.get(e.to)).filter(n => n && !n.props.generated && !n.id.endsWith('.texts'))
    const guarded = new Set(exposed.filter(n => grants(g, n.id).length).map(n => n.id))
    const rootOf = id => { const p = g.edges.find(x => x.rel === 'composes' && x.to === id && x.from !== id); return p ? rootOf(p.from) : id }
    const openPii = [], openOther = [], children = []
    for (const n of exposed) {
      const eg = grants(g, n.id)
      if (eg.length) {
        // one write row when CREATE, UPDATE and DELETE are granted alike, else one row each
        const sig = t => U.map(u => svcOk(u) && can(u, eg, t) ? (rowOnly(u, eg, t) ? 'a' : 'y') : 'n').join('')
        const same = sig('CREATE') === sig('UPDATE') && sig('UPDATE') === sig('DELETE')
        const ops = [['READ', 'READ'], ...(same ? [['create / edit / delete', 'CREATE']] : [['CREATE', 'CREATE'], ['UPDATE', 'UPDATE'], ['DELETE', 'DELETE']])]
        for (const a of g.out(n.id, 'has_action')) ops.push([g.nodes.get(a.to).props.name, g.nodes.get(a.to).props.name])
        for (const [label, token] of ops) {
          const impl = token === label && g.in(`action:${n.props.name}.${token}`, 'handles').length === 0 && !['READ', 'CREATE', 'UPDATE', 'DELETE'].includes(token)
          rows.push({ op: `${short(n.id)} ${label}`, service: short(s.id), entity: n.props.name, token, ev: eg[0].ev,
            note: impl ? 'granted, not implemented' : U.some(u => svcOk(u) && rowOnly(u, eg, token)) ? `own rows only for some users: where ${eg.find(x => x.where)?.where}` : null,
            c: U.map(u => { const ok = svcOk(u) && can(u, eg, token); return { v: ok ? (impl || rowOnly(u, eg, token) ? 'a' : 'y') : 'n', t: ok && testedCell(u, n.id) ? 1 : 0 } }) })
        }
      } else if (guarded.has(rootOf(n.id)) && rootOf(n.id) !== n.id) children.push(n)
      else (piiFields(n).length ? openPii : openOther).push(n)
    }
    if (children.length) {
      const root = g.nodes.get(rootOf(children[0].id)), rg = grants(g, root.id)
      rows.push({ op: `${children.map(n => short(n.id)).join(' / ')} (via ${short(root.id)} draft)`, service: short(s.id), entity: children[0].props.name, token: 'CREATE', ev: rg[0]?.ev, note: 'inherits from the draft root? verify',
        c: U.map(u => ({ v: svcOk(u) && can(u, rg, 'CREATE') ? 'y' : u.anon ? 'n' : 'a', t: 0 })) })
    }
    for (const n of openPii) rows.push({ op: `${short(n.id)} READ (PII: ${piiFields(n).slice(0, 3).join(', ')}${piiFields(n).length > 3 ? ', …' : ''})`, service: short(s.id), entity: n.props.name, token: 'READ', ev: n.evidence, pii: true,
      c: U.map(u => ({ v: !svcOk(u) ? 'n' : sg.length ? 'y' : u.roles.length && U.some(x => x.roles.length) && u.roles.some(r => grants(g, s.id).concat(...exposed.map(e => grants(g, e.id))).some(x => x.role === r && x.grant.includes('*'))) ? 'y' : 'r', t: testedCell(u, n.id) ? 1 : 0 })) })
    if (openOther.length) rows.push({ op: `${s.props.path}: ${openOther.length} other entities READ`, service: short(s.id), entity: null, token: 'READ', ev: openOther[0].evidence,
      c: U.map(u => ({ v: !svcOk(u) ? 'n' : sg.length ? 'y' : u.anon ? (meta.restrictAll ? 'n' : 'a') : 'y', t: 0 })) })
  }
  return { users: U, rows }
}

module.exports = { matrix, users, piiFields, PII, short }
