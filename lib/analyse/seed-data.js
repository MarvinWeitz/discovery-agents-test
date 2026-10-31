// Reads the seed data CAP would load (cds.deploy.resources, via lib/project/cap.js) so generated tests
// can pick real keys, e.g. "a Travel whose TravelStatus_code is X". Files are read with CAP's own
// parsers: cds.parse.csv (what cds deploy uses for .csv, same separators, quoting and BOM handling) and
// JSON for .json seed files. Values are kept as text, the way they appear in the file.
// Step 8 · Walkthrough: docs/walkthrough/08-test-design.md · Sources: docs/walkthrough/references.md (Data)
const fs = require('fs')
const path = require('path')
const cds = require('@sap/cds')
const { seedFiles } = require('../project/cap')

const text = v => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

function parseCsv(csv) {
  const [head, ...rows] = cds.parse.csv(csv) || []
  if (!head) return []
  return rows.map(r => Object.fromEntries(head.map((h, i) => [String(h).trim(), text(r[i])])))
}

function parseJson(json) {
  try { const a = JSON.parse(json); return Array.isArray(a) ? a.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, text(v)]))) : [] } catch { return [] }
}

// entity name (e.g. sap.fe.cap.travel.Travel) → rows
function loadSeed(root) {
  const out = {}
  for (const { file: f, entity: name } of seedFiles(root)) {
    if (name.endsWith('.texts') || out[name]) continue
    const raw = fs.readFileSync(f, 'utf8')
    out[name] = { file: path.relative(root, f), rows: f.endsWith('.json') ? parseJson(raw) : parseCsv(raw) }
  }
  return out
}

module.exports = { loadSeed, parseCsv }
