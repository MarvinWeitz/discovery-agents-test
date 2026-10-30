// Slice planner (deterministic part): cuts vertical feature slices from the graph and ranks them by risk.
// A slice = one exposed service entity traced through UI routes, handlers, rules, the persisted
// entities underneath, compositions, code lists, events and remote calls.

const INVENTORY_TYPES = ['UI5App', 'Route', 'View', 'UIHandler', 'Service', 'ServiceEntity', 'Entity', 'Element', 'Action', 'Event', 'Handler', 'Rule', 'ExternalService', 'DbArtifact']

// Risk weights from the strategy doc; business criticality is unknown until the Phase 0 interview.
const WEIGHTS = { churn: 0.3, centrality: 0.25, external: 0.2, events: 0.15, criticality: 0.1 }

// A slice with more handlers than this is split into sub-slices (one per business-object node and per action).
const SPLIT_HANDLERS = 8

function isSeed(g, n) {
  if (n.type !== 'ServiceEntity') return false
  const p = n.props
  // entities defined in the service itself (virtual, @cds.persistence.skip) count once a handler implements them
  if ((p.generated && !g.in(n.id, 'handles').length) || p.autoexposed || p.codeList || p.name.endsWith('.texts')) return false
  return !g.in(n.id, 'composes').some(e => g.nodes.get(e.from)?.type === 'ServiceEntity')
}

function cutSlices(g) {
  const slices = []
  const seeds = [...g.nodes.values()].filter(n => isSeed(g, n))
  // a service without entity sets (only actions, e.g. a job scheduler API) is a slice of its own
  for (const s of g.byType('Service')) if (!seeds.some(x => x.props.service === s.props.name) && g.out(s.id, 'has_action').length) seeds.push(s)
  const unbound = new Set()
  for (const seed of seeds) {
    const m = new Set([seed.id])
    const add = id => id && g.nodes.has(id) && m.add(id)
    const svc = seed.type === 'Service' ? seed.props.name : seed.props.service
    add(`service:${svc}`)

    // Compositions (service level) are part of the same business object
    const walkComp = id => g.out(id, 'composes').forEach(e => { if (!m.has(e.to)) { add(e.to); walkComp(e.to) } })
    walkComp(seed.id)
    // Projection chain down to persisted entities, plus their compositions
    for (const id of [...m]) {
      let cur = id
      for (let e; (e = g.out(cur, 'projects_on')[0]); cur = e.to) { add(e.to); walkComp(e.to) }
    }
    // Associations ride along transitively (master data, code lists, value helps), but never into another seed
    const seedIds = new Set(seeds.map(s => s.id))
    for (let frontier = [...m], depth = 0; frontier.length && depth < 4; depth++) {
      const next = []
      for (const id of frontier) for (const e of g.out(id, 'associates').concat(g.out(id, 'projects_on'), g.out(id, 'composes'))) {
        if (m.has(e.to) || seedIds.has(e.to) || !g.nodes.has(e.to)) continue
        add(e.to); next.push(e.to)
      }
      frontier = next
    }
    for (const id of [...m]) {
      const n = g.nodes.get(id)
      if (n.type === 'ServiceEntity' || n.type === 'Entity') {
        g.out(id, 'has_element').forEach(e => add(e.to))
        g.out(id, 'has_action').forEach(e => add(e.to))
      }
      // unbound actions and functions ride with the service's first slice, once
      if (n.type === 'Service') g.out(id, 'has_action').filter(e => !unbound.has(e.to)).forEach(e => { unbound.add(e.to); add(e.to) })
    }
    // UI: routes that show any member, their apps, views that bind to members
    for (const e of g.edges.filter(e => (e.rel === 'shows' || e.rel === 'binds_to') && m.has(e.to))) {
      add(e.from)
      g.in(e.from, 'has_route').concat(g.in(e.from, 'has_view')).forEach(x => add(x.from))
      g.out(e.from, 'triggers').forEach(x => add(x.to))
    }
    // Views and fragments of an app in this slice that bind to nothing specific (e.g. Fiori elements extensions)
    for (const a of [...m].filter(id => id.startsWith('ui5app:'))) for (const v of g.out(a, 'has_view')) {
      if (!g.out(v.to, 'binds_to').length) { add(v.to); g.out(v.to, 'triggers').forEach(x => add(x.to)) }
    }
    // Handlers on members (or on the service as a whole), their rules, events, remote calls
    // Subscribers to another service's events join the slice whose data they change (bookstore: OrderChanged -> Books.stock)
    const persisted = new Set([...m].filter(id => id.startsWith('entity:')))
    for (const h of g.byType('Handler')) {
      const on = g.out(h.id, 'handles').map(e => e.to)
      const subscriber = g.out(h.id, 'subscribes').length && g.out(h.id, 'writes').some(e => m.has(e.to) && (persisted.has(e.to) || e.to.startsWith('svcentity:')))
      if (on.some(t => m.has(t) && t !== `service:${svc}`) || (on.includes(`service:${svc}`) && !h.props.target) || subscriber) {
        add(h.id)
        g.out(h.id, 'enforces').forEach(e => add(e.to))
        g.out(h.id, 'emits').concat(g.out(h.id, 'subscribes'), g.out(h.id, 'calls_service')).forEach(e => add(e.to))
        add(`file:${h.props.file}`)
        // remote systems reached from the handler's file or the modules it loads (connectors, lib helpers)
        for (let files = [`file:${h.props.file}`], d = 0; files.length && d < 3; d++) {
          files.forEach(f => g.out(f, 'connects_to').concat(g.out(f, 'calls_service'), g.out(f, 'uses_native')).forEach(e => add(e.to)))
          files = files.flatMap(f => g.out(f, 'imports').map(e => e.to))
        }
      }
    }
    // HANA-native objects behind the slice's entities (calculation views, tables of @cds.persistence.exists)
    for (const id of [...m]) g.out(id, 'backed_by').forEach(e => add(e.to))
    g.byType('ExistingTest').filter(t => g.out(t.id, 'mentions').some(e => m.has(e.to))).forEach(t => add(t.id))
    g.edges.filter(e => e.rel === 'requires' && m.has(e.from)).forEach(e => add(e.to))

    const short = seed.type === 'Service' ? 'operations' : seed.props.name.replace(`${svc}.`, '')
    slices.push({ id: null, name: `${svc.split('.').pop()} / ${short}`, seed: seed.id, members: [...m] })
  }
  return slices
}

function rank(g, slices, history) {
  const files = s => [...new Set(s.members.map(id => g.nodes.get(id)?.evidence?.split(':')[0]).filter(Boolean))]
  const raw = slices.map(s => {
    const fs = files(s)
    const churn = fs.reduce((a, f) => a + (history.churn[f]?.commits || 0), 0)
    const centrality = s.members.reduce((a, id) => a + g.degree(id), 0)
    const external = s.members.filter(id => g.nodes.get(id)?.type === 'ExternalService').length
    const events = s.members.filter(id => g.nodes.get(id)?.type === 'Event').length
    return { churn, centrality, external, events, files: fs }
  })
  const max = k => Math.max(1, ...raw.map(r => r[k]))
  slices.forEach((s, i) => {
    const r = raw[i]
    const f = { churn: r.churn / max('churn'), centrality: r.centrality / max('centrality'), external: r.external / max('external'), events: r.events / max('events'), criticality: 0.5 }
    s.factors = { ...f, raw: { churn: r.churn, centrality: r.centrality, external: r.external, events: r.events } }
    s.risk = +Object.entries(WEIGHTS).reduce((a, [k, w]) => a + w * f[k], 0).toFixed(3)
    s.files = r.files
  })
  slices.sort((a, b) => b.risk - a.risk)
  slices.forEach((s, i) => {
    s.id = `S${String(i + 1).padStart(2, '0')}`
    for (const id of s.members) g.nodes.get(id)?.slices.push(s.id)
  })
  return slices
}

function splitSlices(g, slices) {
  for (const s of slices) {
    const handlers = s.members.filter(id => g.nodes.get(id)?.type === 'Handler')
    if (handlers.length <= SPLIT_HANDLERS) continue
    const parts = []
    const ruleOf = h => g.out(h, 'enforces').map(e => e.to)
    const handlersOn = t => handlers.filter(h => g.out(h, 'handles').some(e => e.to === t))
    const entities = s.members.filter(id => g.nodes.get(id)?.type === 'ServiceEntity' && g.nodes.get(id).props.service === g.nodes.get(s.seed).props.service)
      .filter(id => !g.nodes.get(id).props.name.endsWith('.texts') && !g.nodes.get(id).props.generated)
      .filter(id => id === s.seed || g.in(id, 'composes').some(e => s.members.includes(e.from)))
    for (const e of entities) {
      const m = new Set([e])
      for (let cur = e, x; (x = g.out(cur, 'projects_on')[0]); cur = x.to) { m.add(x.to); g.out(x.to, 'has_element').forEach(y => m.add(y.to)) }
      for (const h of handlersOn(e)) { m.add(h); ruleOf(h).forEach(r => m.add(r)) }
      g.in(e, 'shows').forEach(r => m.add(r.from))
      parts.push({ kind: 'entity', name: `${g.nodes.get(e).props.name.split('.').pop()} lifecycle`, focus: e, members: [...m] })
    }
    for (const a of s.members.filter(id => g.nodes.get(id)?.type === 'Action')) {
      const m = new Set([a])
      for (const h of handlersOn(a)) { m.add(h); ruleOf(h).forEach(r => m.add(r)) }
      parts.push({ kind: 'action', name: `action ${g.nodes.get(a).props.name}${handlersOn(a).length ? '' : ' (no handler found)'}`, focus: a, members: [...m] })
    }
    s.subSlices = parts.map((p, i) => ({ id: `${s.id}.${i + 1}`, ...p, handlers: p.members.filter(id => g.nodes.get(id)?.type === 'Handler').length, rules: p.members.filter(id => g.nodes.get(id)?.type === 'Rule').length }))
  }
  return slices
}

function coverage(g) {
  // entities of a reuse package next to the app (../reviews/db) that no service of this app serves are not this app's inventory
  const foreign = n => n.type === 'Entity' && String(n.evidence).startsWith('..') && !g.in(n.id, 'projects_on').length && !g.in(n.id, 'reads').length && !g.in(n.id, 'writes').length
  const inv = [...g.nodes.values()].filter(n => INVENTORY_TYPES.includes(n.type) && !n.props.generated && !foreign(n))
  const assigned = inv.filter(n => n.slices.length)
  const byType = {}
  for (const n of inv) {
    const t = byType[n.type] ||= { total: 0, assigned: 0 }
    t.total++
    if (n.slices.length) t.assigned++
  }
  const agentOrMedium = [...g.nodes.values()].concat(g.edges).filter(x => x.confidence !== 'high')
  return {
    inventory: inv.length,
    assigned: assigned.length,
    ratio: inv.length ? assigned.length / inv.length : 1,
    byType,
    unassigned: inv.filter(n => !n.slices.length).map(n => ({ id: n.id, type: n.type, evidence: n.evidence })),
    evidenceRatio: ([...g.nodes.values()].filter(n => n.evidence).length + g.edges.filter(e => e.evidence).length) / (g.nodes.size + g.edges.length),
    toVerify: agentOrMedium.length,
  }
}

module.exports = { cutSlices, rank, splitSlices, coverage, WEIGHTS }
