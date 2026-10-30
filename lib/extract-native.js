// HANA-native extractor: links the HDI artifacts in db/src to the CDS model and to the Node code, and
// finds the places where the HANA build and the SQLite test build of the same app differ.
//   entity  -backed_by->   artifact   @cds.persistence.exists entity whose SQL name is the artifact's name
//   artifact -reads->      entity     calculation view data sources, FROM / JOIN / CALL in SQL artifacts
//   file    -uses_native-> artifact   source code that quotes the artifact's name ('Call "sleep"()', 'poetrySlamNumber')
//   DbVariant nodes                   profile-specific database models (db/hana vs db/sqlite)
const fs = require('fs')
const path = require('path')

const sqlName = n => n.replace(/\./g, '_').toUpperCase()
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const lineOf = (text, i) => text.slice(0, i).split('\n').length

// The name the artifact creates in the database
function declaredName(text, kind) {
  if (kind === 'hdbcalculationview') return (text.match(/<Calculation:scenario\b[^>]*?\sid="([^"]+)"/) || [])[1]
  if (kind === 'hdbsynonym') { try { return Object.keys(JSON.parse(text))[0] } catch { return null } }
  const m = text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').match(/^\s*(?:CREATE\s+)?(?:PROCEDURE|FUNCTION|VIEW|SEQUENCE|(?:COLUMN\s+|ROW\s+)?TABLE(?:\s+TYPE)?|TRIGGER|ROLE)\s+"?([\w.:/]+)"?/im)
  return m ? m[1] : null
}

// Database objects the artifact reads from
function sourcesOf(text, kind) {
  if (kind === 'hdbcalculationview') return [...text.matchAll(/<resourceUri>([^<]+)<\/resourceUri>/g)].map(m => m[1])
  if (kind === 'hdbsynonym') { try { return Object.values(JSON.parse(text)).map(v => v.target?.object).filter(Boolean) } catch { return [] } }
  return [...text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|CALL)\s+"?([A-Za-z_][\w.:]*)"?/gi)].map(m => m[1])
}

function extractNative(root, g) {
  const result = { artifacts: 0, backed: 0, reads: 0, codeUses: 0, missing: 0, variants: 0 }
  const arts = g.byType('DbArtifact')
  const entities = g.byType('Entity')
  const bySql = new Map(entities.map(e => [sqlName(e.props.name), e.id]))
  const byName = new Map(), texts = new Map()
  for (const a of arts) {
    let text = ''
    try { text = fs.readFileSync(path.join(root, a.props.file), 'utf8') } catch {}
    a.props.name = declaredName(text, a.props.kind) || path.basename(a.props.file).replace(/\.hdb\w+$/, '')
    byName.set(a.props.name.toUpperCase(), a)
    texts.set(a.id, text)
    result.artifacts++
  }
  for (const a of arts) {
    const text = texts.get(a.id)
    for (const s of new Set(sourcesOf(text, a.props.kind))) {
      const to = bySql.get(s.toUpperCase()), other = byName.get(s.toUpperCase())
      if (to) { g.edge(a.id, 'reads', to, { via: a.props.kind }, { evidence: `${a.props.file}:${lineOf(text, text.indexOf(s))}`, source: 'tool:hdi' }); result.reads++ }
      else if (other && other !== a) g.edge(a.id, 'depends_on', other.id, {}, { evidence: `${a.props.file}:${lineOf(text, text.indexOf(s))}`, source: 'tool:hdi' })
    }
  }
  // @cds.persistence.exists entities: CAP creates no table for them, HANA must already have the object
  for (const e of entities.filter(e => e.props.persistenceExists)) {
    const a = byName.get(sqlName(e.props.name)) || byName.get(e.props.name.split('.').pop().toUpperCase())
    if (a) { g.edge(e.id, 'backed_by', a.id, { kind: a.props.kind }, { evidence: e.evidence, source: 'tool:hdi' }); result.backed++ }
    else { e.props.nativeMissing = true; result.missing++ }
  }
  // Node code that names an artifact
  const names = [...byName.entries()].filter(([n]) => n.length > 3)
  for (const f of g.byType('SourceFile').filter(f => /\.(js|ts)$/.test(f.props.path))) {
    let text = ''
    try { text = fs.readFileSync(path.join(root, f.props.path), 'utf8') } catch { continue }
    for (const [, a] of names) {
      const m = text.match(new RegExp(`["'\`]${esc(a.props.name)}["'\`]`, 'i'))
      if (m) { g.edge(f.id, 'uses_native', a.id, {}, { evidence: `${f.props.path}:${lineOf(text, m.index)}`, source: 'tool:hdi' }); result.codeUses++ }
    }
  }
  // Database models per profile: "db": { "[production]": { "model": "db/hana" }, "[development]": { "model": "db/sqlite" } }
  const pj = path.join(root, 'package.json')
  if (fs.existsSync(pj)) {
    const raw = fs.readFileSync(pj, 'utf8')
    const db = JSON.parse(raw).cds?.requires?.db
    for (const [k, v] of Object.entries(typeof db === 'object' && db ? db : {})) {
      const profile = (k.match(/^\[(.+)\]$/) || [])[1]
      if (!profile || !v?.model) continue
      const models = [].concat(v.model)
      const files = models.flatMap(m => { const d = path.join(root, m); return fs.existsSync(d) && fs.statSync(d).isDirectory() ? fs.readdirSync(d).filter(x => x.endsWith('.cds')).map(x => path.join(m, x)) : fs.existsSync(d + '.cds') ? [m + '.cds'] : [] })
      g.node(`dbvariant:${profile}`, 'DbVariant', { profile, model: models, files, kind: v.kind || null }, { evidence: `package.json:${lineOf(raw, raw.indexOf(`"${k}"`))}`, source: 'tool:config' })
      result.variants++
    }
  }
  return result
}

module.exports = { extractNative, declaredName, sourcesOf }
