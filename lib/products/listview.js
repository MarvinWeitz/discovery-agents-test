// Lists: everything in a product that grows with the app (entities, files, handlers, operations, tests,
// findings, …) is one list, so a large app never turns a card into a wall. The same list feeds
//   - the card (README.md): the whole list when it is short, else the top rows by the list's own order
//     and a link to browse.html;
//   - browse.html: search, a filter per facet column, sort, top N, column picker, copy as Markdown / CSV.
// A step module returns lists: { <id>: L } and puts {{list:<id>}} in its md where the block goes.
//   L = { title, noun, what, columns: [{ key, label, facet, num }], rows: [{...}], sort: { key, dir },
//         chart: { kind: bars|stacked|matrix|tree|columns, title, ... }, inline, empty }
// Rows may carry _c (colour), _n (note), _cells (matrix cells aligned with chart.cols), _path (columns).
// Runs in Node (cards) and in the browser (browse.html inlines this file and svg.js).
const norm = v => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v))
const plain = v => norm(v).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

function facets(L) {
  const out = {}
  for (const c of L.columns.filter(c => c.facet)) {
    const n = {}
    for (const r of L.rows) for (const v of [].concat(r[c.key] ?? '')) n[v] = (n[v] || 0) + 1
    out[c.key] = Object.entries(n).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
  }
  return out
}

// st = { q, f: { key: value }, sort, dir }
function apply(L, st = {}) {
  const q = String(st.q || '').toLowerCase().trim()
  const keys = L.columns.map(c => c.key)
  let rows = L.rows.filter(r => {
    for (const [k, v] of Object.entries(st.f || {})) if (v !== '' && v != null && ![].concat(r[k] ?? '').map(String).includes(String(v))) return false
    return !q || q.split(/\s+/).every(w => keys.some(k => plain(r[k]).toLowerCase().includes(w)))
  })
  const key = st.sort || L.sort?.key, dir = (st.dir || L.sort?.dir || 'desc') === 'asc' ? 1 : -1
  if (key) {
    const num = rows.every(r => r[key] == null || r[key] === '' || typeof r[key] === 'number')
    rows = rows.slice().sort((a, b) => num ? dir * ((+a[key] || 0) - (+b[key] || 0)) : dir * plain(a[key]).localeCompare(plain(b[key])))
  }
  return rows
}

// matrix columns that still have a cell in these rows (optionally only the picked ones)
function liveCols(L, rows, pick) {
  const cols = L.chart?.cols || []
  return cols.map((c, j) => j).filter(j => (!pick || pick.includes(cols[j])) && rows.some(r => r._cells?.[j]))
}

function chart(L, rows, svg, { pick } = {}) {
  const c = L.chart
  if (!c || !rows.length) return ''
  const lab = r => plain(r[c.label || L.columns[0].key])
  if (c.kind === 'bars') return svg.bars(rows.map(r => ({ label: lab(r), value: +r[c.value] || 0, color: r._c, tone: c.tone, note: r._n })), { title: c.title, max: c.max, unit: c.unit || '' })
  if (c.kind === 'stacked') return svg.stacked(rows.map(r => ({ label: lab(r), parts: c.keys.map(k => ({ key: k.key, value: +r[k.key] || 0 })) })), c.keys, { title: c.title })
  if (c.kind === 'tree') return svg.tree(rows.map(r => ({ label: lab(r), value: +r[c.value] || 0, color: r._c, note: r._n })), { title: c.title })
  if (c.kind === 'matrix') {
    const js = liveCols(L, rows, pick)
    if (!js.length) return ''
    return svg.matrix(rows.map(lab), js.map(j => c.cols[j]), (i, j) => rows[i]._cells[js[j]], { title: c.title, cw: c.cw })
  }
  if (c.kind === 'columns') {
    const levels = [], seen = new Set()
    for (const r of rows) (r._path || []).forEach((n, i) => {
      if (seen.has(i + '|' + n.id)) return
      seen.add(i + '|' + n.id); (levels[i] ||= []).push({ ...n, parent: i ? r._path[i - 1].id : undefined })
    })
    return levels.length ? svg.columns(levels, { title: c.title, colW: c.colW }) : ''
  }
  return ''
}

// table: the list's columns, then one column per (live) matrix column with the cell text
function table(L, rows, { pick } = {}) {
  const js = L.chart?.kind === 'matrix' ? liveCols(L, rows, pick) : []
  const head = [...L.columns.filter(c => !c.hide).map(c => c.label), ...js.map(j => L.chart.cols[j])]
  const body = rows.map(r => [...L.columns.filter(c => !c.hide).map(c => norm(r[c.key])), ...js.map(j => r._cells?.[j]?.text ?? '')])
  return { head, body }
}

const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
function markdown(L, rows, o) {
  const { head, body } = table(L, rows, o)
  if (!body.length) return L.empty || '_none_'
  return [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n')
}
function csv(L, rows, o) {
  const { head, body } = table(L, rows, o)
  const q = v => /[",\n]/.test(v = plain(v)) ? `"${v.replace(/"/g, '""')}"` : v
  return [head, ...body].map(r => r.map(q).join(',')).join('\n') + '\n'
}

const sortLabel = L => { const k = L.sort?.key; const c = L.columns.find(x => x.key === k); return c ? `${c.label.toLowerCase()}${L.sort.dir === 'asc' ? ' (ascending)' : ''}` : 'their order' }

module.exports = { facets, apply, chart, table, markdown, csv, liveCols, sortLabel, plain }
