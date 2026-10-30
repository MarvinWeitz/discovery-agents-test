// Runs the rules library: deterministic detectors that started life as agent findings.
// A rule module exports { key, title, status: 'draft' | 'accepted', from, i, l, lay, test, detect(ctx) }
// where detect returns [{ ev: 'file:line', t, d }]. ctx = { root, files: [{ path, text }], g, csn }.
// Only accepted rules feed the atlas risks; drafts are reported next to them until a reviewer accepts.
const fs = require('fs')
const path = require('path')

const LIB = path.join(__dirname, 'library')

function sources(root) {
  const out = []
  const walk = (d, rel) => {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      if (['node_modules', '.git', 'gen', '@cds-models', 'webapp', 'dist', 'test', 'src'].includes(e.name)) continue
      const p = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(p, r)
      else if (/\.(cds|js|ts)$/.test(e.name) && !/\.d\.ts$|\.test\./.test(e.name)) out.push({ path: r, text: fs.readFileSync(p, 'utf8') })
    }
  }
  for (const d of ['srv', 'db', 'app']) walk(path.join(root, d), d)
  return out
}

function library() {
  return fs.readdirSync(LIB).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).sort().map(f => require(path.join(LIB, f)))
}

function run(ctx) {
  return library().map(r => {
    let hits = [], error = null
    try { hits = r.detect(ctx) || [] } catch (e) { error = e.message }
    return { key: r.key, title: r.title, status: r.status, from: r.from, i: r.i, l: r.l, lay: r.lay, test: r.test, hits, error }
  })
}

module.exports = { sources, library, run }
