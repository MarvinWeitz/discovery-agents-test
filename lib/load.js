// Loads a discovery run (graph + slice catalog) back into memory.
const fs = require('fs')
const path = require('path')
const { Graph } = require('./graph')

function loadRun(runDir) {
  const g = new Graph(null)
  const read = f => fs.readFileSync(path.join(runDir, 'graph', f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  for (const n of read('nodes.jsonl')) g.nodes.set(n.id, n)
  for (const e of read('edges.jsonl')) g.edges.push({ key: `${e.from}|${e.rel}|${e.to}|${e.props?.element ?? e.props?.via ?? e.props?.grant ?? ''}`, ...e })
  const slices = JSON.parse(fs.readFileSync(path.join(runDir, 'slices', 'catalog.json'), 'utf8'))
  return { g, slices }
}

function findSlice(slices, id) {
  for (const s of slices) {
    if (s.id === id) return { slice: s, parent: null }
    const sub = (s.subSlices || []).find(p => p.id === id)
    if (sub) return { slice: { ...sub, files: s.files, risk: s.risk }, parent: s }
  }
  throw new Error(`slice ${id} not found`)
}

function saveGraph(runDir, g) {
  const { nodes, edges } = g.toJSONL()
  fs.writeFileSync(path.join(runDir, 'graph', 'nodes.jsonl'), nodes)
  fs.writeFileSync(path.join(runDir, 'graph', 'edges.jsonl'), edges)
}

module.exports = { loadRun, findSlice, saveGraph }
