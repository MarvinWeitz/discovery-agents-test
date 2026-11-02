// Knowledge graph: every node and edge carries evidence, source, confidence and run.
// Walkthrough: docs/walkthrough/README.md
class Graph {
  constructor(run) {
    this.run = run
    this.nodes = new Map()
    this.edges = []
  }

  node(id, type, props = {}, meta = {}) {
    const existing = this.nodes.get(id)
    if (existing) return Object.assign(existing.props, props), existing
    const n = { id, type, props, evidence: meta.evidence || null, source: meta.source || 'tool', confidence: meta.confidence || 'high', slices: [], run: this.run }
    this.nodes.set(id, n)
    return n
  }

  edge(from, rel, to, props = {}, meta = {}) {
    const key = `${from}|${rel}|${to}|${props?.element ?? props?.via ?? props?.grant ?? ''}` // two associations to the same target are two edges
    if (this._index().keys.has(key)) return
    this.edges.push({ key, from, rel, to, props, evidence: meta.evidence || null, source: meta.source || 'tool', confidence: meta.confidence || 'high', run: this.run })
  }

  // Lookup indexes, built lazily and extended when edges or nodes were added (also by direct pushes, e.g. lib/load.js).
  // Without them out/in/byType scan everything on every call, which made big apps run for many minutes.
  _index() {
    const I = this._ix ||= { n: 0, keys: new Set(), from: new Map(), to: new Map(), nodes: -1, types: null }
    if (I.n > this.edges.length) { this._ix = null; return this._index() }
    const add = (m, k, e) => { const l = m.get(k); l ? l.push(e) : m.set(k, [e]) }
    for (; I.n < this.edges.length; I.n++) { const e = this.edges[I.n]; I.keys.add(e.key); add(I.from, e.from, e); add(I.to, e.to, e) }
    return I
  }
  byType(type) {
    const I = this._index()
    if (I.nodes !== this.nodes.size) { I.types = new Map(); for (const n of this.nodes.values()) { const l = I.types.get(n.type); l ? l.push(n) : I.types.set(n.type, [n]) } I.nodes = this.nodes.size }
    return [...(I.types.get(type) || [])]
  }
  out(id, rel) { return (this._index().from.get(id) || []).filter(e => !rel || e.rel === rel) }
  in(id, rel) { return (this._index().to.get(id) || []).filter(e => !rel || e.rel === rel) }
  degree(id) { const I = this._index(); return (I.from.get(id) || []).length + (I.to.get(id) || []).filter(e => e.from !== id).length }

  toJSONL() {
    const nodes = [...this.nodes.values()].map(n => JSON.stringify(n)).join('\n') + '\n'
    const edges = this.edges.map(({ key, ...e }) => JSON.stringify(e)).join('\n') + '\n'
    return { nodes, edges }
  }
}

const loc = l => l ? `${l.file}:${l.line}` : null

module.exports = { Graph, loc }
