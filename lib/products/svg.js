// Small standalone SVG charts for the step cards (L1). Each file carries its own light/dark colours in a
// <style> block, so it reads on GitHub, in an <img> tag and in the HTML pages alike. No browser needed.
const { hierarchy, treemap, treemapSquarify } = require('d3-hierarchy')

const LAYER = { model: '#4f5bd5', service: '#138a7e', code: '#b26a00', ui: '#8a4fc4', access: '#c2414b', tests: '#2f8a3a', run: '#5b6875' }
const TONE = { ok: '#2f8a3a', warn: '#c27c0e', bad: '#c2414b', info: '#3f7fbf', none: '#8c959f', open: '#8c959f' }

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const cut = (s, n) => (s = String(s ?? '')).length > n ? s.slice(0, n - 1) + '…' : s

function wrap(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title || '')}">
<style>
text{font:12px system-ui,-apple-system,"Segoe UI",sans-serif;fill:#24292f}
.m{fill:#57606a}.s{font-size:11px}.b{font-weight:600}.h{font-size:13px;font-weight:600}
.g{stroke:#d0d7de}.bg{fill:#f6f8fa}
@media (prefers-color-scheme: dark){text{fill:#e6edf3}.m{fill:#9198a1}.g{stroke:#3d444d}.bg{fill:#161b22}}
</style>
${title ? `<title>${esc(title)}</title>` : ''}${body}</svg>\n`
}

// horizontal bars: rows [{label, value, tone|color, note}]
function bars(rows, { title, width = 640, unit = '', max } = {}) {
  const lw = Math.min(360, Math.max(90, ...rows.map(r => String(r.label).length * 7.2))), bw = width - lw - 70, rh = 22
  const M = max || Math.max(1, ...rows.map(r => r.value))
  let b = ''
  rows.forEach((r, i) => {
    const y = 8 + i * rh, w = Math.max(r.value ? 2 : 0, (r.value / M) * bw)
    b += `<text x="${lw - 8}" y="${y + 14}" text-anchor="end">${esc(cut(r.label, 52))}</text>`
    b += `<rect x="${lw}" y="${y + 3}" width="${bw}" height="14" rx="3" class="bg"/><rect x="${lw}" y="${y + 3}" width="${w.toFixed(1)}" height="14" rx="3" fill="${r.color || TONE[r.tone] || TONE.info}"/>`
    b += `<text x="${lw + w + 6}" y="${y + 14}" class="m s">${esc(r.note ?? (r.value + unit))}</text>`
  })
  return wrap(width, 16 + rows.length * rh, b, title)
}

// stacked horizontal bars: rows [{label, parts:[{key,value}]}], keys [{key,label,color}]
function stacked(rows, keys, { title, width = 680 } = {}) {
  const lw = Math.min(240, Math.max(90, ...rows.map(r => String(r.label).length * 7.2))), bw = width - lw - 60, rh = 24
  const M = Math.max(1, ...rows.map(r => r.parts.reduce((a, p) => a + p.value, 0)))
  let b = ''
  rows.forEach((r, i) => {
    const y = 34 + i * rh; let x = lw
    b += `<text x="${lw - 8}" y="${y + 14}" text-anchor="end">${esc(cut(r.label, 36))}</text>`
    for (const p of r.parts) { const w = (p.value / M) * bw; if (w > 0) b += `<rect x="${x.toFixed(1)}" y="${y + 3}" width="${w.toFixed(1)}" height="15" fill="${keys.find(k => k.key === p.key)?.color || '#999'}"><title>${esc(p.key)}: ${p.value}</title></rect>`; x += w }
    b += `<text x="${x + 6}" y="${y + 15}" class="m s">${r.parts.reduce((a, p) => a + p.value, 0)}</text>`
  })
  let lx = lw
  for (const k of keys) { b += `<rect x="${lx}" y="10" width="10" height="10" rx="2" fill="${k.color}"/><text x="${lx + 14}" y="19" class="m s">${esc(k.label)}</text>`; lx += 24 + k.label.length * 6.4 }
  return wrap(width, 44 + rows.length * rh, b, title)
}

// heat matrix: rows [label], cols [label], cell(r,c) -> {text, color, title} | null
function matrix(rows, cols, cell, { title, cw = 64, rh = 24, lw } = {}) {
  lw = lw || Math.min(300, Math.max(100, ...rows.map(r => String(r).length * 7.2)))
  const head = Math.min(110, Math.max(30, ...cols.map(c => String(c).length * 6.2)))
  const W = lw + cols.length * cw + 10, H = head + rows.length * rh + 10
  let b = ''
  cols.forEach((c, j) => { const x = lw + j * cw + cw / 2; b += `<text transform="translate(${x},${head - 6}) rotate(-35)" class="m s">${esc(cut(c, 18))}</text>` })
  rows.forEach((r, i) => {
    const y = head + i * rh
    b += `<text x="${lw - 8}" y="${y + 16}" text-anchor="end">${esc(cut(r, 46))}</text>`
    cols.forEach((c, j) => {
      const v = cell(i, j); const x = lw + j * cw
      b += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" rx="3" fill="${v?.color || 'transparent'}" ${v ? '' : 'class="bg"'}>${v?.title ? `<title>${esc(v.title)}</title>` : ''}</rect>`
      if (v?.text) b += `<text x="${x + cw / 2}" y="${y + 16}" text-anchor="middle" class="s" style="fill:${v.ink || '#fff'}">${esc(v.text)}</text>`
    })
  })
  return wrap(W, H, b, title)
}

// timeline: rows [{label, start, seconds, tone, note}] start in seconds from 0
function gantt(rows, { title, width = 720 } = {}) {
  const lw = 150, bw = width - lw - 110, rh = 24
  const end = Math.max(1, ...rows.map(r => (r.start || 0) + (r.seconds || 0)))
  let b = `<line x1="${lw}" y1="4" x2="${lw}" y2="${12 + rows.length * rh}" class="g"/>`
  rows.forEach((r, i) => {
    const y = 8 + i * rh, x = lw + ((r.start || 0) / end) * bw, w = Math.max(3, ((r.seconds || 0) / end) * bw)
    b += `<text x="${lw - 8}" y="${y + 14}" text-anchor="end">${esc(r.label)}</text>`
    b += r.seconds == null ? `<text x="${lw + 6}" y="${y + 14}" class="m s">${esc(r.note || '')}</text>` : `<rect x="${x.toFixed(1)}" y="${y + 3}" width="${w.toFixed(1)}" height="15" rx="3" fill="${TONE[r.tone] || TONE.info}"><title>${esc(r.note || '')}</title></rect><text x="${(x + w + 6).toFixed(1)}" y="${y + 14}" class="m s">${r.seconds}s ${esc(cut(r.note || '', 14))}</text>`
  })
  return wrap(width, 16 + rows.length * rh, b, title)
}

// squarified treemap: items [{label, value, color, note}]
function tree(items, { title, width = 720, height = 360 } = {}) {
  const root = hierarchy({ children: items.filter(i => i.value > 0) }).sum(d => d.value || 0).sort((a, b) => b.value - a.value)
  treemap().tile(treemapSquarify).size([width, height]).paddingInner(2)(root)
  let b = ''
  for (const l of root.leaves()) {
    const w = l.x1 - l.x0, h = l.y1 - l.y0, d = l.data
    b += `<g><title>${esc(d.label)}: ${esc(d.note || d.value)}</title><rect x="${l.x0.toFixed(1)}" y="${l.y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${d.color || TONE.info}"/>`
    if (w > 60 && h > 18) b += `<text x="${(l.x0 + 5).toFixed(1)}" y="${(l.y0 + 15).toFixed(1)}" class="s" style="fill:#fff">${esc(cut(d.label, Math.floor(w / 6.5)))}</text>`
    if (w > 60 && h > 34) b += `<text x="${(l.x0 + 5).toFixed(1)}" y="${(l.y0 + 29).toFixed(1)}" class="s" style="fill:#fff;opacity:.85">${esc(cut(d.note || d.value, Math.floor(w / 6.5)))}</text>`
    b += '</g>'
  }
  return wrap(width, height, b, title)
}

// a layered tree: columns of boxes left to right, links parent -> child. levels: [[{id,label,color,parent}]]
function columns(levels, { title, colW = 230, boxH = 22, gap = 6 } = {}) {
  const pos = new Map(); let H = 0, b = ''
  levels.forEach((lev, li) => lev.forEach((n, i) => { const y = 10 + i * (boxH + gap); pos.set(n.id, [10 + li * colW, y]); H = Math.max(H, y + boxH + 10) }))
  // centre each parent on its children (deepest level first), then push down to remove overlaps
  for (let li = levels.length - 2; li >= 0; li--) {
    let floor = 10
    for (const n of levels[li]) {
      const kids = (levels[li + 1] || []).filter(k => k.parent === n.id).map(k => pos.get(k.id)[1])
      const want = kids.length ? (Math.min(...kids) + Math.max(...kids)) / 2 : floor
      const y = Math.max(floor, want); pos.set(n.id, [10 + li * colW, y]); floor = y + boxH + gap; H = Math.max(H, y + boxH + 10)
    }
  }
  levels.forEach(lev => lev.forEach(n => { if (n.parent && pos.has(n.parent)) { const [x1, y1] = pos.get(n.parent), [x2, y2] = pos.get(n.id); b += `<path d="M${x1 + colW - 30} ${y1 + boxH / 2} C${x1 + colW - 10} ${y1 + boxH / 2},${x2 - 20} ${y2 + boxH / 2},${x2} ${y2 + boxH / 2}" fill="none" class="g"/>` } }))
  levels.forEach(lev => lev.forEach(n => { const [x, y] = pos.get(n.id); b += `<g><title>${esc(n.title || n.label)}</title><rect x="${x}" y="${y}" width="${colW - 30}" height="${boxH}" rx="4" fill="${n.color || TONE.info}" fill-opacity=".16" stroke="${n.color || TONE.info}"/><text x="${x + 8}" y="${y + 15}" class="s">${esc(cut(n.label, Math.floor((colW - 44) / 6.4)))}</text></g>` }))
  return wrap(10 + levels.length * colW, H, b, title)
}

module.exports = { LAYER, TONE, esc, cut, wrap, bars, stacked, matrix, gantt, tree, columns }
