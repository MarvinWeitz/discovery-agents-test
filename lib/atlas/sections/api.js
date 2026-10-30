// Atlas section API · Interfaces: service roots, entity sets, actions, access. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { piiFields, short } = require('../../analyse/authz')

function api(g) {
  const out = []
  const guarded = new Set(g.edges.filter(e => e.rel === 'requires').map(e => e.from))
  const rootOf = id => { const p = g.edges.find(x => x.rel === 'composes' && x.to === id && x.from !== id); return p ? rootOf(p.from) : id }
  for (const s of g.byType('Service')) {
    const sets = [], acts = []
    for (const e of g.out(s.id, 'exposes')) {
      const n = g.nodes.get(e.to); if (!n || n.props.generated || n.id.endsWith('.texts')) continue
      const root = rootOf(n.id), parentGuarded = root !== n.id && guarded.has(root)
      const access = guarded.has(n.id) || guarded.has(s.id) ? 'auth' : parentGuarded ? 'auth?' : 'open'
      const pii = piiFields(n)
      const methods = parentGuarded ? 'via ' + short(root) + ' draft' : n.props.readonly || n.props.autoexposed || n.props.codeList ? 'GET' : 'GET POST PATCH DELETE'
      sets.push([short(n.id), methods, access, [n.props.draft && 'draft', pii.length && `PII: ${pii.join(', ')}`, n.props.autoexposed && !parentGuarded && 'auto-exposed'].filter(Boolean).join(' · ')])
      for (const a of g.out(n.id, 'has_action')) {
        const an = g.nodes.get(a.to)
        const roles = g.out(n.id, 'requires').filter(r => String(r.props.grant).split(',').some(x => x === '*' || x === an.props.name)).map(r => short(r.to))
        acts.push([an.props.name, roles.join(', ') || (guarded.has(s.id) ? 'service role' : 'none'), g.in(an.id, 'handles').length ? '' : 'no handler', short(n.id)])
      }
    }
    for (const a of g.byType('Action').filter(a => a.id.startsWith(`action:${s.props.name}.`) && !a.props.bound))
      acts.push([a.props.name, g.out(s.id, 'requires').map(r => short(r.to)).join(', ') || 'none', g.in(a.id, 'handles').length ? 'unbound' : 'unbound · no handler', null])
    out.push({ root: s.props.path, svc: short(s.id), sets: sets.sort((a, b) => (b[3].includes('PII') - a[3].includes('PII')) || a[0].localeCompare(b[0])), acts })
  }
  return out
}

module.exports = { api }
