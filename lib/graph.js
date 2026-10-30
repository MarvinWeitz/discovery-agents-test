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
    if (this.edges.some(e => e.key === key)) return
    this.edges.push({ key, from, rel, to, props, evidence: meta.evidence || null, source: meta.source || 'tool', confidence: meta.confidence || 'high', run: this.run })
  }

  byType(type) { return [...this.nodes.values()].filter(n => n.type === type) }
  out(id, rel) { return this.edges.filter(e => e.from === id && (!rel || e.rel === rel)) }
  in(id, rel) { return this.edges.filter(e => e.to === id && (!rel || e.rel === rel)) }
  degree(id) { return this.edges.filter(e => e.from === id || e.to === id).length }

  toJSONL() {
    const nodes = [...this.nodes.values()].map(n => JSON.stringify(n)).join('\n') + '\n'
    const edges = this.edges.map(({ key, ...e }) => JSON.stringify(e)).join('\n') + '\n'
    return { nodes, edges }
  }
}

const loc = l => l ? `${l.file}:${l.line}` : null

module.exports = { Graph, loc }
