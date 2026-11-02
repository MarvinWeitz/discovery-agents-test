// From the stress corpus AI pass (2026-11-02): a "bug-free" shape lost its emit('OrderApproved') and only the
// AI agent noticed. An event declared on a service of this app that no code of the app emits: subscribers and
// consumers wait for a message that never comes. Events emitted under a computed name are not counted as missing.
const { short, local } = require('./_cap')
module.exports = {
  key: 'event-never-emitted',
  title: 'Declared event that the app never emits',
  status: 'draft',
  from: 'stress corpus AI pass (2026-11-02): emit lost in a refactoring',
  i: 3, l: 2, lay: 'Node',
  test: 'Run the action that should raise the event in cds.test and assert a subscriber receives it.',
  detect({ g, csn }) {
    const out = []
    if (!g || !csn) return out
    // a handler that emits a computed name (emit(name)) could raise any event: say nothing
    // and a handler passed by reference (require, method) has a body the parser did not read
    if (g.byType('Handler').some(h => (h.props.emitsExpr || []).length || h.props.opaque)) return out
    const emitted = new Set(g.edges.filter(e => e.rel === 'emits').map(e => e.to.replace(/^event:/, '')))
    const anyHandler = g.byType('Handler').length > 0
    if (!anyHandler) return out
    for (const [name, d] of Object.entries(csn.definitions)) {
      if (d.kind !== 'event') continue
      const svc = Object.keys(csn.definitions).filter(n => csn.definitions[n].kind === 'service' && name.startsWith(n + '.')).sort((a, b) => b.length - a.length)[0]
      if (!svc || !local(csn, svc)) continue
      const ev = name.slice(svc.length + 1)
      if (emitted.has(name) || emitted.has(ev) || [...emitted].some(x => x.endsWith('.' + ev))) continue
      const subs = g.edges.filter(e => e.rel === 'subscribes' && e.to.replace(/^event:/, '') === name).length
      out.push({ ev: d.$location ? `${d.$location.file}:${d.$location.line}` : null, t: `${short(svc)}.${ev} is declared but never emitted`,
        d: `No handler of the app emits '${ev}' on ${svc}${subs ? `, yet ${subs} subscriber(s) listen for it` : ''}. Consumers wait for a message that never comes, or the declaration is dead.` })
    }
    return out
  }
}
