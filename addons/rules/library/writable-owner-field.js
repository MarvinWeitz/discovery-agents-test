// Drafted from agent finding A1 (ui5-cap-event-app): rows are filtered by `Email = $user.id`, but Email
// is a plain writable element, so a user can PATCH it and hand the row to someone else.
// Pattern: a @restrict where compares an element to $user, and the element is not read-only/computed.
const short = s => String(s).split('.').pop()
module.exports = {
  key: 'writable-owner-field',
  title: 'Row-ownership field is writable by the owner',
  status: 'draft',
  from: 'agent finding A1 (ui5-cap-event-app, 2026-10-29)',
  i: 4, l: 2, lay: 'Service',
  test: 'As the owner, PATCH the ownership field to another user and save; expect 400 or the field unchanged.',
  detect({ g, csn }) {
    const out = []
    if (!g || !csn) return out
    for (const e of g.edges.filter(e => e.rel === 'requires' && e.props?.where)) {
      const m = String(e.props.where).match(/(\w+)\s*=\s*\$user(?:\.id)?\b|\$user(?:\.id)?\s*=\s*(\w+)/)
      if (!m) continue
      const field = m[1] || m[2]
      const grants = String(e.props.grant).split(',')
      if (!grants.some(x => ['UPDATE', 'WRITE', '*', 'PATCH'].includes(x))) continue
      const svcEnt = e.from.replace(/^svcentity:/, '')
      const def = csn.definitions?.[svcEnt], base = csn.definitions?.[def?.query?.SELECT?.from?.ref?.[0] || def?.projection?.from?.ref?.[0]] || def
      const el = def?.elements?.[field] || base?.elements?.[field]
      if (!el) continue
      const locked = el['@readonly'] || el['@Core.Computed'] || el['@cds.on.insert'] || el['@cds.on.update'] || el['@Core.Immutable'] || el.key
      if (locked) continue
      out.push({ ev: e.evidence, t: `${short(svcEnt)}.${field} decides ownership and is writable`, d: `@restrict grants ${grants.join(', ')} to ${short(e.to)} where ${e.props.where}, but ${field} has no @readonly, @Core.Computed, @Core.Immutable or @cds.on.insert. The owner can change ${field} and hand the row to another user (or lose it).` })
    }
    return out
  }
}
