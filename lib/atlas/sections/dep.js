// Atlas section DEP · CDS file dependencies and layer verdicts. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { base } = require('../util')

function dep(g) {
  const files = g.byType('CdsFile')
  const order = { app: 0, srv: 1, db: 2, ext: 3 }
  const rows = {}
  const FILES = files.map(f => ({ f, l: f.props.path.startsWith('@') || !/^(app|srv|db)\//.test(f.props.path) ? 'ext' : f.props.layer }))
    .sort((a, b) => order[a.l] - order[b.l] || a.f.props.path.localeCompare(b.f.props.path))
    .map(({ f, l }) => { rows[l] = (rows[l] ?? -1) + 1; const p = f.props.path; const nm = p.split('/').length > 3 ? `${p.split('/')[0]}/…/${base(p)}` : p; return [p, nm, l, rows[l]] })
  const ids = new Set(FILES.map(f => f[0]))
  const rank = { bad: 2, skip: 1, ok: 0 }
  const M = {}
  for (const e of g.edges.filter(e => ['uses', 'annotates', 'extends'].includes(e.rel))) {
    const a = e.from.replace('cdsfile:', ''), b = e.to.replace('cdsfile:', '')
    if (!ids.has(a) || !ids.has(b) || a === b) continue
    const k = a + '>' + b, v = e.props.verdict || 'ok'
    if (!M[k] || rank[v] > rank[M[k][2]]) M[k] = [a, b, v, e.props.why || null, e.evidence]
  }
  return { FILES, DEPS: Object.values(M) }
}

module.exports = { dep }
