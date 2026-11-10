// Impact analysis on the knowledge graph: "what is affected if I change X?"
// Walks the graph against the direction of dependency: a service entity projects on a db entity, so a
// change to the db entity reaches the service entity, then the handlers that read or write it, the UI
// routes that show it, the tests that call it, the roles that guard it. Used by the model product
// (explorer page and Markdown), the query CLI (bin/query.js impact) and the per-entity impact files.
//
// Edge "a rel b" means:
//   a depends on b  for A_DEP rels (a service entity projects_on its entity, a handler writes an entity)
//   b depends on a  for B_DEP rels (an action belongs to its entity, a rule belongs to its handler)
// composes counts both ways (a deep insert reaches the child, the child's lifecycle follows the parent).
// associations are optional: a key change breaks them, most other changes do not.

const A_DEP = ['projects_on', 'exposes', 'handles', 'reads', 'writes', 'shows', 'mentions', 'has_route', 'has_view', 'uses', 'composes', 'enforced_by', 'checked_in', 'calls', 'navigates_to']
const B_DEP = ['has_action', 'enforces', 'requires', 'composes']
const STOP = ['Role', 'MockUser'] // reached, but not walked further (users of a role are not "changed")
const SKIP = ['Finding', 'SourceFile', 'CdsFile', 'Element'] // not part of the impact picture
const LAYER = { Entity: 'model', Service: 'service', ServiceEntity: 'service', Action: 'service', Handler: 'code', Rule: 'code', Helper: 'code', UI5App: 'ui', Route: 'ui', View: 'ui', UiRule: 'ui', Role: 'access', MockUser: 'access', ExistingTest: 'tests', GeneratedTest: 'tests' }
const LAYERS = { model: 'Model', service: 'Service', code: 'Code', ui: 'UI', access: 'Access', tests: 'Tests' }

function label(n) {
  const p = n.props || {}, t = n.type
  if (t === 'Handler') return `${p.phase} ${(p.events || []).join('/')} ${(p.target || '').split('.').pop()}`.trim()
  if (t === 'Rule') return `${p.kind || 'rule'} ${p.field || ''}`.trim() + (p.field ? '' : ` @${String(n.evidence || '').split(':').pop()}`)
  if (t === 'UiRule') return `${p.action || p.kind} · ${p.verdict || ''}`
  if (['Entity', 'ServiceEntity', 'Service', 'Action'].includes(t)) return short(p.name || n.id.split(':').slice(1).join(':'))
  if (t === 'ExistingTest') { const f = n.id.split(':').slice(1).join(':'); const parts = f.split('/'); return parts.length > 2 ? `${parts.at(-1)} (${parts[1]})` : parts.at(-1) }
  return p.name || n.id.split(':').slice(1).join(':')
}
// drop the namespace of db entities when it is the same everywhere; keep Service.Entity readable
let NS = ''
const short = s => (NS && s.startsWith(NS + '.') ? s.slice(NS.length + 1) : s)

// the compact graph the explorer page and the CLI use: nodes [{id,type,label,layer,ev}], edges [[from,rel,to]]
function compact(nodes, edges) {
  const ents = nodes.filter(n => n.type === 'Entity').map(n => n.props?.name || '')
  const pre = ents.length ? ents.reduce((a, s) => { while (a && !s.startsWith(a + '.')) a = a.split('.').slice(0, -1).join('.'); return a }, ents[0].split('.').slice(0, -1).join('.')) : ''
  NS = pre
  const keep = nodes.filter(n => !SKIP.includes(n.type))
  const ids = new Set(keep.map(n => n.id))
  return {
    ns: pre,
    nodes: keep.map(n => ({ id: n.id, type: n.type, label: label(n), layer: LAYER[n.type] || 'run', ev: n.evidence || '' })),
    edges: edges.filter(e => ids.has(e.from) && ids.has(e.to)).map(e => [e.from, e.rel, e.to]),
  }
}

// breadth-first walk; returns [{id, d (steps away), via:[parentId, rel]}] without the start node
function impact(G, start, { depth = 3, assoc = false } = {}) {
  const type = new Map(G.nodes.map(n => [n.id, n.type]))
  const A = new Set(A_DEP), B = new Set(B_DEP)
  const dist = new Map([[start, 0]]), via = new Map()
  let frontier = [start]
  for (let d = 1; d <= depth && frontier.length; d++) {
    const fs = new Set(frontier), next = []
    for (const [a, r, b] of G.edges) {
      if ((A.has(r) || (assoc && r === 'associates')) && fs.has(b) && !dist.has(a)) { dist.set(a, d); via.set(a, [b, r]); next.push(a) }
      if (B.has(r) && fs.has(a) && !dist.has(b)) { dist.set(b, d); via.set(b, [a, r]); next.push(b) }
    }
    frontier = next.filter(i => !STOP.includes(type.get(i)))
  }
  return [...dist].filter(([, d]) => d > 0).map(([id, d]) => ({ id, d, via: via.get(id) }))
}

// find a node by id, exact label, or the end of its name ("Travel", "TravelService.Travel", "srv/x.ts:16")
function find(G, q) {
  const s = String(q).toLowerCase()
  const exact = G.nodes.find(n => n.id.toLowerCase() === s) || G.nodes.find(n => n.label.toLowerCase() === s && n.type === 'Entity') || G.nodes.find(n => n.label.toLowerCase() === s)
  if (exact) return exact
  return G.nodes.find(n => n.id.toLowerCase().endsWith(s)) || G.nodes.find(n => (n.ev || '').toLowerCase() === s) || null
}

function markdown(G, start, res, { depth } = {}) {
  const N = new Map(G.nodes.map(n => [n.id, n])), s = N.get(start)
  const by = {}; for (const r of res) (by[N.get(r.id).layer] ||= []).push(r)
  const L = [`## Impact: change ${s.type} \`${s.label}\``, '', `${res.length} things depend on it within ${depth} steps (\`${s.ev}\`).`, '', '| Layer | Count |', '| --- | --- |']
  for (const l of Object.keys(LAYERS)) if (by[l]) L.push(`| ${LAYERS[l]} | ${by[l].length} |`)
  for (const l of Object.keys(LAYERS)) if (by[l]) {
    L.push('', `### ${LAYERS[l]}`, '')
    for (const r of by[l].sort((a, b) => a.d - b.d || N.get(a.id).label.localeCompare(N.get(b.id).label))) { const n = N.get(r.id); L.push(`- ${n.label} (${n.type}, ${r.d} away, via ${r.via[1]} ${N.get(r.via[0]).label}) \`${n.ev}\``) }
  }
  L.push('', `> Tests to run first: ${(by.tests || []).map(r => N.get(r.id).label).join(', ') || 'none reaches it: add one'}`)
  return L.join('\n') + '\n'
}

module.exports = { compact, impact, find, markdown, LAYER, LAYERS, A_DEP, B_DEP, STOP }
