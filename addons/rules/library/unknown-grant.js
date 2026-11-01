// From the stress corpus (seed authz-grant-typo): a @restrict grant names an event that is neither a CAP
// operation (READ, WRITE, ...) nor an action or function of the entity or service, so it grants nothing.
const { isGeneric, short, operations } = require('./_cap')
module.exports = {
  key: 'unknown-grant',
  title: '@restrict grant names no operation of the entity',
  status: 'draft',
  from: 'stress corpus (2026-11-01): grant typos',
  i: 3, l: 3, lay: 'Service',
  test: 'Call the intended operation as the granted role, expect success (today: 403).',
  detect({ g, csn }) {
    const out = []
    if (!g || !csn) return out
    for (const e of g.edges.filter(e => e.rel === 'requires' && e.props?.grant)) {
      const target = e.from.replace(/^\w+:/, '')
      const svc = Object.keys(csn.definitions).filter(n => csn.definitions[n].kind === 'service' && (target === n || target.startsWith(n + '.'))).sort((a, b) => b.length - a.length)[0]
      if (!svc) continue
      const ops = new Set([...Object.keys(csn.definitions[target]?.actions || {}), ...operations(csn, svc)])
      for (const t of String(e.props.grant).split(',').map(x => x.trim()).filter(Boolean)) {
        if (isGeneric(t, true) || ops.has(t)) continue
        out.push({ ev: e.evidence, t: `Grant '${t}' on ${short(target)} matches no operation`, d: `@restrict on ${target} grants '${t}' to ${short(e.to)}, but ${short(target)} has no such action or function and it is not a CAP event${ops.size ? ` (operations: ${[...ops].slice(0, 6).join(', ')})` : ''}. The grant has no effect.` })
      }
    }
    return out
  }
}
