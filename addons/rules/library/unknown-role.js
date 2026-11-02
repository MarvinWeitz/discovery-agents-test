// From the stress corpus (seeds authz-role-typo-requires, authz-role-typo-restrict, config-xs-security-missing-scope):
// @requires / @restrict name a role that nothing can grant. With an xs-security.json the role must be one of its
// scopes (that is what production can assign); without one, at least one configured mock user must hold it.
// Typos lock real users out (403 for everyone) and pass every test that runs as a privileged mock user.
const { PSEUDO_ROLES, short, lev } = require('./_cap')
module.exports = {
  key: 'unknown-role',
  title: 'Role in @requires / @restrict that nobody can be given',
  status: 'draft',
  from: 'stress corpus (2026-11-01): role typos and incomplete xs-security.json',
  i: 3, l: 3, lay: 'Service',
  test: 'Request the operation as a user holding the intended role (as configured in xs-security.json), expect success.',
  detect({ g }) {
    const out = []
    if (!g) return out
    const xs = new Set(g.byType('Role').filter(r => r.props.xsuaa).map(r => r.props.name))
    const users = g.byType('MockUser')
    const held = new Set(users.flatMap(u => u.props.roles || []))
    if (!xs.size && !users.some(u => !u.props.capDefault)) return out // nothing to compare with
    const seen = new Set()
    for (const e of g.edges.filter(e => e.rel === 'requires')) {
      const role = e.to.replace(/^role:/, '')
      if (PSEUDO_ROLES.includes(role) || seen.has(`${role}|${e.evidence}`)) continue
      const missing = xs.size ? !xs.has(role) : !held.has(role)
      if (!missing) continue
      seen.add(`${role}|${e.evidence}`)
      const near = [...(xs.size ? xs : held)].filter(r => r.toLowerCase() === role.toLowerCase() || lev(r.toLowerCase(), role.toLowerCase()) <= 2)
      out.push({ ev: e.evidence, t: `Role '${role}' on ${short(e.from.replace(/^\w+:/, ''))} is ${xs.size ? 'not a scope in xs-security.json' : 'held by no mock user'}`,
        d: `${e.from.replace(/^\w+:/, '')} grants ${e.props.grant || 'access'} to '${role}', but ${xs.size ? `xs-security.json defines only ${[...xs].join(', ')}` : `no configured user has it (users hold ${[...held].join(', ') || 'no roles'})`}${near.length ? `; did you mean ${near.map(r => `'${r}'`).join(' or ')}?` : ''}. Nobody can be given this role, so the grant never applies.` })
    }
    return out
  }
}

