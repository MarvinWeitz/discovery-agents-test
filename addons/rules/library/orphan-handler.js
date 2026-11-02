// From the stress corpus (seeds action-orphan-handler, action-handler-typo): srv.on('cancel', ...) on a service
// that declares no cancel action, function or event. The handler never runs; usually a typo or a removed action.
const { isGeneric, short, local, operations } = require('./_cap')
module.exports = {
  key: 'orphan-handler',
  title: 'Handler for an event the service does not declare',
  status: 'draft',
  from: 'stress corpus (2026-11-01): handler name typos and dead handlers',
  i: 2, l: 3, lay: 'Node',
  test: 'Call the operation the handler was written for and assert its effect; delete the handler if the operation is gone.',
  detect({ g, csn }) {
    const out = []
    if (!g || !csn) return out
    for (const h of g.byType('Handler')) {
      const svc = h.props.service
      if (!svc || !local(csn, svc)) continue
      const ops = operations(csn, svc), expr = new Set(h.props.exprEvents || [])
      for (const e of h.props.events || []) {
        // a subscription to another service's event is the unknown-event rule's business
        const subscribed = g.edges.some(x => x.from === h.id && x.rel === 'subscribes' && x.to.endsWith(`.${e}`))
        if (subscribed || expr.has(e) || isGeneric(e) || ops.has(e) || ops.has(short(e)) || !/^[A-Za-z_][\w.]*$/.test(e)) continue
        out.push({ ev: h.evidence, t: `${h.props.phase}('${e}') on ${short(svc)}: no such action, function or event`, d: `${h.evidence} registers a ${h.props.phase} handler for '${e}' on ${svc}${h.props.target ? ` (${short(h.props.target)})` : ''}, but the service declares no operation or event of that name, so it never runs.${ops.size ? ` Declared: ${[...ops].filter(o => !o.includes('.')).slice(0, 8).join(', ')}.` : ''}` })
      }
    }
    return out
  }
}
