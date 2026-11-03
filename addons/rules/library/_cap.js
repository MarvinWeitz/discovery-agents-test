// Shared CAP vocabulary for the rules that compare names (roles, grants, events) with the model.
// Not a rule: the engine loads only files without a leading underscore.
const PSEUDO_ROLES = ['authenticated-user', 'any', 'system-user', 'internal-user']
// events every CAP service knows: CRUD, REST, draft, generic hooks (srv.on('error'), srv.after('each'))
const GENERIC_EVENTS = ['*', 'READ', 'CREATE', 'UPDATE', 'DELETE', 'UPSERT', 'INSERT', 'WRITE', 'GET', 'POST', 'PUT', 'PATCH',
  'NEW', 'EDIT', 'SAVE', 'CANCEL', 'DISCARD', 'draftActivate', 'draftEdit', 'draftPrepare', 'draftDiscard', 'draftNew', 'each', 'error', 'CHANGE']
// handler events are case-sensitive (srv.on('cancel') is not the draft CANCEL); grants are compared loosely
const isGeneric = (e, loose = false) => GENERIC_EVENTS.some(x => loose ? x.toLowerCase() === String(e).toLowerCase() : x === e)
const short = s => String(s).split('.').pop()
const local = (csn, svc) => csn?.definitions?.[svc]?.kind === 'service' && !csn.definitions[svc]['@cds.external']

// names an operation or event of service svc can be called by: actions/functions/events of the service and
// bound actions of its entities
function operations(csn, svc) {
  const out = new Set()
  for (const [n, d] of Object.entries(csn?.definitions || {})) {
    if (!n.startsWith(svc + '.')) continue
    const rest = n.slice(svc.length + 1)
    if (['action', 'function', 'event'].includes(d.kind)) { out.add(rest); out.add(short(rest)) }
    for (const a of Object.keys(d.actions || {})) out.add(a)
  }
  return out
}
// edit distance, for "did you mean"
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

// In-process async events: a service emits a name on itself and has its own srv.on for it (smart-core review,
// 2026-11-03). CAP delivers it without an event declaration, so it is a pattern, not an unknown event plus an
// orphan handler. Returns the event names (short) per service.
function internalEvents(g, svc) {
  const hs = g.byType('Handler').filter(h => h.props.service === svc)
  const emitted = new Set(hs.flatMap(h => g.out(h.id, 'emits').filter(e => !e.props?.on || e.props.on === svc).map(e => e.to.replace(/^event:/, '').replace(svc + '.', ''))))
  const handled = new Set(hs.filter(h => h.props.phase === 'on').flatMap(h => h.props.events || []))
  return new Set([...emitted].filter(e => handled.has(e)))
}

module.exports = { PSEUDO_ROLES, GENERIC_EVENTS, isGeneric, short, local, operations, lev, internalEvents }
