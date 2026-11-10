// The review brief at the top of the PR comment: what a reviewer does with the change, not what changed in
// the graph. Two answers the rest of the diff does not give:
//   - tests to run: the existing and generated tests that reach the changed code or model, found through
//     the graph (changed rule -> its handler -> the entities it handles -> tests that call them);
//   - messages users see: error messages added, removed or reworded by the change.
// Authorization, risks and lost class tests already have their own sections in report.js.
const fs = require('fs')
const path = require('path')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const CODE = ['Handler', 'Rule', 'Helper', 'UiRule', 'Action', 'Entity', 'ServiceEntity', 'Element']

// the entities (db and service) a changed node acts on, in the graph g = { nodes: Map, edges: [] }
function targets(g, id) {
  const n = g.nodes.get(id)
  if (!n) return []
  const out = (rels, from = id) => g.edges.filter(e => e.from === from && rels.includes(e.rel)).map(e => e.to)
  const inn = (rels, to = id) => g.edges.filter(e => e.to === to && rels.includes(e.rel)).map(e => e.from)
  const ofHandler = h => out(['handles', 'reads', 'writes'], h)
  let t = []
  if (n.type === 'Entity' || n.type === 'ServiceEntity') t = [id]
  else if (n.type === 'Element') t = n.props?.entity ? ['entity:' + n.props.entity] : inn(['has_element'])
  else if (n.type === 'Handler') t = ofHandler(id)
  else if (n.type === 'Rule' || n.type === 'Helper') t = [...inn(['enforces', 'calls']), ...out(['enforced_by'])].flatMap(ofHandler)
  else if (n.type === 'Action') t = inn(['has_action'])
  else if (n.type === 'UiRule') t = out(['on'])
  // a db entity is called through the service entities that project on it, and the other way round
  const all = new Set(t)
  for (const x of t) { for (const s of inn(['projects_on'], x)) all.add(s); for (const s of out(['projects_on'], x)) all.add(s) }
  return [...all].filter(x => g.nodes.has(x))
}

const nameOf = id => String(id).split(/[:.]/).filter(Boolean).pop()
const msgOf = n => n?.type === 'Rule' && n.props?.kind === 'rejection' ? String(n.props.message || '') : null

function brief(d, headDir) {
  const A = { nodes: new Map(d._a.nodes.map(n => [n.id, n])), edges: d._a.edges }
  const B = { nodes: new Map(d._b.nodes.map(n => [n.id, n])), edges: d._b.edges }
  const g = d.graph
  const touched = [...g.added.map(n => [n, B]), ...g.changed.map(n => [B.nodes.get(n.id) || n, B]), ...g.removed.map(n => [n, A])].filter(([n]) => CODE.includes(n.type))
  const ents = new Map() // entity id -> why
  for (const [n, G] of touched) for (const t of targets(G, n.id)) if (!ents.has(t)) ents.set(t, `${n.type} ${n.evidence || nameOf(n.id)}`)
  // tests: in the head graph (they must exist after the change); a removed entity keeps its old tests
  const existing = new Map()
  for (const G of [B, A]) for (const e of G.edges) if (e.rel === 'mentions' && ents.has(e.to) && G.nodes.get(e.from)?.type === 'ExistingTest') {
    const f = e.from.replace(/^test:/, '')
    if (!existing.has(f)) existing.set(f, { file: f, entities: new Set(), gone: G === A && !B.nodes.has(e.from) })
    existing.get(f).entities.add(nameOf(e.to))
  }
  const gm = readJson(path.join(headDir, 'run', 'tests', 'generated', 'manifest.json'))
  const names = [...new Set([...ents.keys()].map(nameOf))].filter(Boolean).map(n => [n, new RegExp(`\\b${n.replace(/[^A-Za-z0-9_]/g, '')}\\b`)])
  const generated = new Map()
  for (const t of (Array.isArray(gm) ? gm : gm?.tests || [])) {
    const hit = names.filter(([, re]) => re.test(`${t.cls} ${t.title}`)).map(([n]) => n)
    if (!hit.length) continue
    if (!generated.has(t.file)) generated.set(t.file, { file: t.file, n: 0, entities: new Set() })
    const x = generated.get(t.file); x.n++; hit.forEach(h => x.entities.add(h))
  }
  // messages: rejection rules (a rule that only moved lines is neither added nor removed in the graph diff)
  const messages = []
  for (const n of g.added) if (msgOf(n) != null) messages.push({ change: 'added', text: msgOf(n), status: n.props.status || 400, ev: n.evidence })
  for (const n of g.removed) if (msgOf(n) != null) messages.push({ change: 'removed', text: msgOf(n), status: n.props.status || 400, ev: n.evidence })
  for (const c of g.changed) { const a = A.nodes.get(c.id), b = B.nodes.get(c.id); if (msgOf(a) != null && msgOf(b) != null && msgOf(a) !== msgOf(b)) messages.push({ change: 'reworded', was: msgOf(a), text: msgOf(b), status: b.props.status || 400, ev: b.evidence }) }
  return {
    entities: [...ents].map(([id, why]) => ({ id, name: nameOf(id), why })),
    existing: [...existing.values()].map(x => ({ ...x, entities: [...x.entities] })),
    generated: [...generated.values()].map(x => ({ ...x, entities: [...x.entities] })),
    messages,
  }
}

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
function renderBrief(b) {
  const L = []
  if (b.entities.length) {
    const ex = b.existing.filter(x => !x.gone), gen = b.generated
    L.push('### 🧪 Tests to run', '', `The change reaches **${b.entities.map(e => e.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')}**. These tests call ${b.entities.length > 1 ? 'them' : 'it'}:`, '')
    if (ex.length + gen.length) L.push('| Test file | Kind | Reaches |', '| --- | --- | --- |',
      ...ex.map(x => `| \`${cell(x.file)}\` | existing | ${x.entities.join(', ')} |`),
      ...gen.map(x => `| \`${cell(x.file)}\` | generated (${x.n} tests) | ${x.entities.join(', ')} |`), '')
    else L.push('_No existing or generated test calls the changed entities: the change ships untested._', '')
    const gone = b.existing.filter(x => x.gone)
    if (gone.length) L.push(`Removed with the change: ${gone.map(x => '`' + x.file + '`').join(', ')}.`, '')
  }
  if (b.messages.length) {
    L.push('### 💬 Messages users see', '', '| Change | Message | HTTP | Where |', '| --- | --- | --- | --- |',
      ...b.messages.map(m => `| ${m.change} | ${m.was ? `~~${cell(m.was)}~~ → ` : ''}${cell(m.text)} | ${m.status} | \`${cell(m.ev)}\` |`), '')
  }
  return L
}

module.exports = { brief, renderBrief, targets }
