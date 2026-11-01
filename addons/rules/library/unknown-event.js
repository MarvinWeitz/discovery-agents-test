// From the stress corpus (seeds event-emit-undeclared, event-subscribe-typo): an event emitted on, or subscribed
// to on, a service of this app that does not declare it. Emitter and subscribers must use the same name; an
// undeclared name is usually a typo, and the subscriber then never runs.
const { short, local } = require('./_cap')
module.exports = {
  key: 'unknown-event',
  title: 'Event emitted or subscribed to that the service does not declare',
  status: 'draft',
  from: 'stress corpus (2026-11-01): event name typos',
  i: 3, l: 3, lay: 'Node',
  test: 'Emit the declared event in cds.test and assert the subscriber\'s effect.',
  detect({ g, csn }) {
    const out = []
    if (!g || !csn) return out
    const declared = n => ['event', 'action', 'function'].includes(csn.definitions[n]?.kind)
    for (const e of g.edges.filter(e => e.rel === 'emits')) {
      const svc = g.nodes.get(e.from)?.props?.service
      const name = e.to.replace(/^event:/, ''), ev = name.startsWith(svc + '.') ? name.slice(svc.length + 1) : name
      if (!svc || !local(csn, svc) || declared(`${svc}.${ev}`)) continue
      const known = Object.keys(csn.definitions).filter(n => n.startsWith(svc + '.') && csn.definitions[n].kind === 'event').map(short)
      out.push({ ev: e.evidence, t: `emit('${ev}') on ${short(svc)}: event not declared`, d: `${e.evidence} emits '${ev}' on ${svc}, which declares ${known.length ? `only ${known.join(', ')}` : 'no events'}. Subscribers to the declared events never hear about it.` })
    }
    for (const e of g.edges.filter(e => e.rel === 'subscribes')) {
      const name = e.to.replace(/^event:/, '')
      const svc = Object.keys(csn.definitions).filter(n => name.startsWith(n + '.') && local(csn, n)).sort((a, b) => b.length - a.length)[0]
      if (!svc || declared(name)) continue
      const known = Object.keys(csn.definitions).filter(n => n.startsWith(svc + '.') && csn.definitions[n].kind === 'event').map(short)
      out.push({ ev: e.evidence, t: `Subscription to '${short(name)}' on ${short(svc)}: no such event`, d: `${e.evidence} subscribes to '${name.slice(svc.length + 1)}', but ${svc} declares ${known.length ? `only ${known.join(', ')}` : 'no events'}. The subscriber never runs.` })
    }
    return out
  }
}
