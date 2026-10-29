// CDS file dependencies: `using` imports plus `annotate` / `extend` targets, each resolved to the
// file that owns the target definition. Checks the layer rule app → srv → db → framework:
//   ok    allowed direction
//   skip  UI annotations placed straight on domain entities (common, but bypasses the service layer)
//   bad   a file changes something another layer owns, or a lower layer depends on a higher one
const fs = require('fs')
const path = require('path')
const { walk } = require('./extract-handlers')

const RANK = { app: 0, srv: 1, db: 2, ext: 3 }
const layerOf = rel => (rel.startsWith('app/') ? 'app' : rel.startsWith('srv/') ? 'srv' : rel.startsWith('db/') ? 'db' : 'ext')

function resolveFile(root, fromRel, spec) {
  if (!spec.startsWith('.')) return spec // package: @sap/cds/common
  const base = path.normalize(path.join(path.dirname(fromRel), spec))
  for (const c of [base, base + '.cds', path.join(base, 'index.cds')]) if (fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isFile()) return c
  return base + '.cds'
}

function extractCdsDeps(root, g, csn) {
  const files = ['app', 'srv', 'db'].flatMap(d => walk(path.join(root, d), p => p.endsWith('.cds'))).map(f => path.relative(root, f)).filter(f => !f.split(path.sep).includes('xmpls'))
  const services = Object.keys(csn.definitions).filter(n => csn.definitions[n].kind === 'service')
  const homeOf = name => {
    // service entities live in their service's file, even when CAP auto-exposed them from db/
    const svc = services.find(s => name.startsWith(s + '.'))
    const d = csn.definitions[svc || name]
    const f = d?.$location?.file ? path.normalize(d.$location.file) : null
    return f && f.includes('node_modules' + path.sep) ? f.split('node_modules' + path.sep).pop().replace(/\.cds$/, '') : f
  }
  const out = { files: files.length, uses: 0, annotates: 0, violations: 0 }
  const node = rel => {
    const id = `cdsfile:${rel}`
    if (!g.nodes.has(id)) g.node(id, 'CdsFile', { path: rel, layer: layerOf(rel), lines: fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8').split('\n').length : 0 }, { evidence: `${rel}:1`, source: 'tool:cds-deps' })
    return id
  }
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8')
    const lines = src.split('\n')
    const lineAt = i => src.slice(0, i).split('\n').length
    node(rel)
    const alias = {}
    // using { a.b as x, C } from '...';  using X from '...';  using from '...';
    for (const m of src.matchAll(/^\s*using\s+(?:\{([^}]*)\}|([\w.]+)(?:\s+as\s+(\w+))?)?\s*from\s+['"]([^'"]+)['"]/gm)) {
      const target = resolveFile(root, rel, m[4])
      node(target)
      const ln = lineAt(m.index + m[0].indexOf('using'))
      const imported = m[1] ? m[1].split(',').map(x => x.trim()).filter(Boolean) : m[2] ? [`${m[2]}${m[3] ? ' as ' + m[3] : ''}`] : []
      for (const im of imported) { const [n, a] = im.split(/\s+as\s+/); alias[(a || n.split('.').pop()).trim()] = n.trim() }
      const bad = RANK[layerOf(target)] < RANK[layerOf(rel)]
      g.edge(`cdsfile:${rel}`, 'uses', `cdsfile:${target}`, { imports: imported, verdict: bad ? 'bad' : 'ok', why: bad ? 'lower layer imports a higher one' : null, element: 'using' }, { evidence: `${rel}:${ln}`, source: 'tool:cds-deps' })
      out.uses++
      if (bad) out.violations++
    }
    const resolve = n => {
      const [first, ...rest] = n.split('.')
      const full = alias[first] ? [alias[first], ...rest].join('.') : n
      if (csn.definitions[full]) return full
      // alias of a namespace (sap.fe.cap.travel as schema) or a service imported by name
      const hit = Object.keys(csn.definitions).find(d => d === full || d.endsWith('.' + full))
      return hit || full
    }
    // annotate X with ... / extend [entity|aspect|type] X with ...
    for (const m of src.matchAll(/^\s*(annotate|extend)\s+(?:entity\s+|aspect\s+|type\s+|service\s+|projection\s+)?([\w.]+)/gm)) {
      const name = resolve(m[2])
      const ln = lineAt(m.index + m[0].indexOf(m[1]))
      const home = homeOf(name) || (name.startsWith('cds.') ? '@sap/cds (built-in)' : null)
      if (!home || path.normalize(home) === path.normalize(rel)) continue
      node(home)
      const from = layerOf(rel), to = home.startsWith('@') ? 'ext' : layerOf(home)
      let verdict = 'ok', why = null
      if (name.startsWith('cds.')) { verdict = 'bad'; why = `${m[1]}s built-in ${name} for the whole model` }
      else if (to === from) verdict = 'ok'
      else if (from === 'app' && to === 'db') { verdict = m[1] === 'extend' ? 'bad' : 'skip'; why = m[1] === 'extend' ? `extends domain ${name.split('.').pop()}` : 'annotates domain' }
      else if (from === 'srv' && to === 'db') { verdict = 'bad'; why = `${m[1]}s domain ${name.split('.').pop()}` }
      else if (RANK[to] < RANK[from]) { verdict = 'bad'; why = `${m[1]}s a higher layer` }
      g.edge(`cdsfile:${rel}`, m[1] === 'annotate' ? 'annotates' : 'extends', `cdsfile:${home}`, { target: name, verdict, why, element: name }, { evidence: `${rel}:${ln}`, source: 'tool:cds-deps', quote: lines[ln - 1].trim().slice(0, 120) })
      out.annotates++
      if (verdict === 'bad') out.violations++
    }
  }
  return out
}

module.exports = { extractCdsDeps, layerOf }
