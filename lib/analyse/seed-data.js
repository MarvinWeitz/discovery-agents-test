// Reads the app's CSV seed data (db/data, test/data) so generated tests can pick real keys,
// e.g. "a Travel whose TravelStatus_code is X".
// Step 8 · Walkthrough: docs/walkthrough/08-test-design.md
const fs = require('fs')
const path = require('path')
const { walk } = require('../project/files')
const { layout } = require('../project/layout')

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (!lines.length) return []
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ','
  const split = l => { const out = []; let cur = '', q = false; for (const c of l) { if (c === '"') q = !q; else if (c === sep && !q) { out.push(cur); cur = '' } else cur += c } out.push(cur); return out }
  const head = split(lines[0]).map(h => h.trim())
  return lines.slice(1).map(l => Object.fromEntries(split(l).map((v, i) => [head[i], v])))
}

// entity name (e.g. sap.fe.cap.travel.Travel) → rows
function loadSeed(root) {
  const out = {}
  for (const f of layout(root).seedDirs.flatMap(d => walk(d, p => p.endsWith('.csv')))) {
    const name = path.basename(f, '.csv').replace(/-/g, '.')
    if (name.endsWith('.texts')) continue
    out[name] = { file: path.relative(root, f), rows: parseCsv(fs.readFileSync(f, 'utf8')) }
  }
  return out
}

module.exports = { loadSeed, parseCsv }
