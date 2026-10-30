// Markdown for a run diff: the PR comment. GitHub renders the ```mermaid block as the
// changed-nodes graph; everything else is plain tables so it also reads well for AI agents.
const { short } = require('./diff')

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const code = s => s ? '`' + s + '`' : ''
const AUTHL = { y: 'allowed', n: 'denied', r: 'OPEN (no role)', a: 'unclear' }
const ST = { tested: 'tested', gen: 'generated', spec: 'spec only', likely: 'likely', fail: 'failing', none: 'untested' }

function headline(d) {
  const g = d.graph, c = d.classes
  const bad = [
    d.risks.added.length && `🔴 **${d.risks.added.length} new risk${d.risks.added.length > 1 ? 's' : ''}**`,
    d.patterns.breaks.length && `🟠 **${d.patterns.breaks.length} pattern break${d.patterns.breaks.length > 1 ? 's' : ''}**`,
    (c.lost.length + c.removed.filter(x => x.lostTest).length) && `🟡 **${c.lost.length + c.removed.filter(x => x.lostTest).length} equivalence class${c.lost.length + c.removed.filter(x => x.lostTest).length > 1 ? 'es' : ''} lost their test**`,
    d.auth.filter(x => x.now === 'r').length && `🔓 **${d.auth.filter(x => x.now === 'r').length} authorization cell${d.auth.filter(x => x.now === 'r').length > 1 ? 's' : ''} newly open**`]
  const good = [d.risks.resolved.length && `✅ ${d.risks.resolved.length} risk${d.risks.resolved.length > 1 ? 's' : ''} resolved`, d.patterns.fixed.length && `✅ ${d.patterns.fixed.length} pattern${d.patterns.fixed.length > 1 ? 's' : ''} fixed`, c.gained.length && `✅ ${c.gained.length} class${c.gained.length > 1 ? 'es' : ''} gained a test`]
  const size = `Graph: +${g.added.length} / −${g.removed.length} / ~${g.changed.length} nodes, +${g.eAdded.length} / −${g.eRemoved.length} edges${g.moved.length ? `, ${g.moved.length} only moved lines` : ''}.`
  const parts = [...bad, ...good].filter(Boolean)
  return { line: parts.length ? parts.join(' · ') : '✅ **No change in risks, patterns, authorization or test coverage.**', size, bad: bad.filter(Boolean).length }
}

// changed nodes, their changed edges and one ring of context; capped so the graph stays readable
function name(n) {
  if (!n) return '?'
  const p = n.props || {}
  if (n.type === 'Rule') return `${p.kind === 'rejection' ? 'reject ' + (p.status || 400) : p.kind} ${p.message || p.field || p.guard || ''}`
  if (n.type === 'Handler') return `${p.phase} ${(p.events || []).join('/')} ${short(p.target || p.service || '')}`
  if (n.type === 'UiRule') return `${p.action || p.kind} ${p.ui || ''}`
  if (/File$/.test(n.type)) return String(p.path || n.id).split('/').pop()
  return p.name ? short(p.name) : short(n.id)
}

function mermaid(d, max = 28) {
  const g = d.graph
  // base-only nodes live under base:<id>, so a removed rule and the rule that moved onto its line stay apart
  const gone = new Set(g.removed.map(n => n.id)), mv = new Map(g.moved.map(m => [m.from, m.to]))
  const baseId = id => gone.has(id) ? 'base:' + id : mv.get(id) || id
  const tone = new Map()
  for (const n of g.added) tone.set(n.id, 'add')
  for (const n of g.removed) tone.set('base:' + n.id, 'del')
  for (const n of g.changed) if (!tone.has(n.id)) tone.set(n.id, 'chg')
  const types = new Map([...d.nodes].map(([id, n]) => [id, n.type]))
  const boring = new Set(['Element', 'CdsFile', 'SourceFile', 'ExistingTest', 'Finding'])
  const pick = [...tone.keys()].sort((x, y) => boring.has(types.get(x)) - boring.has(types.get(y))).slice(0, max)
  const keep = new Set(pick)
  const edges = [...g.eAdded.map(e => ({ ...e, t: 'add' })), ...g.eRemoved.map(e => ({ ...e, from: baseId(e.from), to: baseId(e.to), t: 'del' }))].filter(e => keep.has(e.from) || keep.has(e.to))
  for (const e of edges) for (const id of [e.from, e.to]) if (!keep.has(id) && keep.size < max + 10) { keep.add(id); tone.set(id, tone.get(id) || 'ctx') }
  if (!keep.size) return null
  const ids = new Map([...keep].map((id, i) => [id, 'n' + i]))
  const label = id => `${types.get(id) || ''}: ${name(d.nodes.get(id))}`.replace(/\$\{[^}]*\}/g, '…').replace(/["[\]{}()<>|#]/g, ' ').replace(/\s+/g, ' ').slice(0, 48)
  const prefix = { add: '+ ', del: '− ', chg: '~ ', ctx: '' }
  const L = ['flowchart LR']
  for (const id of keep) L.push(`  ${ids.get(id)}["${prefix[tone.get(id)]}${label(id)}"]:::${tone.get(id)}`)
  const seen = new Set()
  for (const e of edges) { if (!ids.has(e.from) || !ids.has(e.to)) continue; const k = `${e.from}|${e.to}|${e.t}`; if (seen.has(k)) continue; seen.add(k); L.push(`  ${ids.get(e.from)} ${e.t === 'add' ? '==>' : '-.->'}|${e.t === 'add' ? '+' : '−'} ${e.rel}| ${ids.get(e.to)}`) }
  L.push('  classDef add fill:#dcefdf,stroke:#2c7a3a,color:#14201e', '  classDef del fill:#f8dcd8,stroke:#c0352a,color:#14201e,stroke-dasharray:4 3', '  classDef chg fill:#f7e8cf,stroke:#a86a10,color:#14201e', '  classDef ctx fill:#e9eeec,stroke:#8a9893,color:#5a6a66')
  const more = tone.size - pick.length - [...keep].filter(id => tone.get(id) === 'ctx').length
  return { text: L.join('\n'), more: Math.max(0, more) }
}

function render(d, { title = 'Discovery diff', note = '' } = {}) {
  const h = headline(d), c = d.classes, L = []
  L.push(`## ${title}`, '', h.line, '', `<sub>${h.size} Base \`${String(d.base || '?').slice(0, 7)}\` → head \`${String(d.head || '?').slice(0, 7)}\`.${note ? ' ' + note : ''}</sub>`, '')
  if (d.risks.added.length) L.push('### 🔴 New risks', '', '| Id | Risk | Score | Found by | Evidence |', '| --- | --- | --- | --- | --- |', ...d.risks.added.map(r => `| ${r.id} | ${cell(r.t)} | ${r.i * r.l} | ${r.src === 'agent' ? 'agent' : 'rule ' + code(r.key)} | ${code(r.ev)} |`), '')
  if (d.patterns.breaks.length) L.push('### 🟠 Pattern breaks', '', '| Pattern | Where | Was → now | Evidence |', '| --- | --- | --- | --- |', ...d.patterns.breaks.map(p => `| ${cell(p.n)} | ${cell(p.w)} | ${p.was || 'new'} → **${p.h === 'cr' ? 'defect' : 'wrong place'}** | ${code(p.ev)} |`), '')
  const lost = [...c.lost.map(x => ({ ...x, how: `${ST[x.was]} → ${ST[x.st]}` })), ...c.removed.filter(x => x.lostTest).map(x => ({ ...x, how: `${ST[x.st]} → class gone` }))]
  if (lost.length) L.push('### 🟡 Equivalence classes that lost their test', '', '| Class | Category | Change |', '| --- | --- | --- |', ...lost.slice(0, 20).map(x => `| ${code(x.id.replace('#removed', ''))} ${cell(x.name)} | ${cell(x.cat)} | ${x.how} |`), lost.length > 20 ? `\n…and ${lost.length - 20} more.` : '', '')
  if (d.auth.length) L.push('### 🔓 Authorization changes', '', '| Operation | User | Was → now | Evidence |', '| --- | --- | --- | --- |', ...d.auth.slice(0, 20).map(x => `| ${cell(x.op)} | ${x.user} | ${AUTHL[x.was] || x.was || 'new'} → ${x.now === 'r' ? '**OPEN (no role)**' : AUTHL[x.now] || x.now || 'gone'} | ${code(x.ev)} |`), '')
  if (d.parity.length) L.push('### UI promises vs server', '', '| Rule | Was → now | Evidence |', '| --- | --- | --- |', ...d.parity.map(x => `| ${cell(x.rule)} | ${x.was || 'new'} → ${x.now === 'ui-only' ? '**ui-only**' : x.now || 'gone'} | ${code(String(x.ev).split(' · ')[0])} |`), '')
  if (d.risks.resolved.length || d.patterns.fixed.length || c.gained.length) {
    L.push('### ✅ Better', '')
    for (const r of d.risks.resolved) L.push(`- Risk resolved: ${r.id} ${r.t} (${code(r.ev)})`)
    for (const p of d.patterns.fixed) L.push(`- Pattern fixed: ${p.n} (${p.w})`)
    for (const x of c.gained.slice(0, 10)) L.push(`- Class gained a test: ${code(x.id)} ${x.name}`)
    L.push('')
  }
  if (d.risks.rescored.length) L.push('Risk scores changed: ' + d.risks.rescored.map(r => `${r.id} ${r.was} → ${r.i * r.l}`).join(', ') + '.', '')
  if (c.added.length) L.push(`**${c.added.length} new equivalence class${c.added.length > 1 ? 'es' : ''}**, ${c.added.filter(x => !['tested', 'gen', 'spec'].includes(x.st)).length} without a test: ` + c.added.slice(0, 8).map(x => code(x.id)).join(', ') + (c.added.length > 8 ? ', …' : '') + '.', '')
  const m = mermaid(d)
  if (m) L.push('### Changed nodes', '', '```mermaid', m.text, '```', `<sub>Green added, red removed, amber changed, grey context.${m.more ? ` ${m.more} more changed nodes are listed below.` : ''}</sub>`, '')
  if (d.kpis.length) L.push('<details><summary>Measures</summary>', '', '| Measure | Base | Head |', '| --- | --- | --- |', ...d.kpis.map(k => `| ${cell(k.label)} | ${k.was ?? '–'} | ${k.now} |`), '', '</details>', '')
  const g = d.graph
  if (g.added.length + g.removed.length + g.changed.length) {
    L.push('<details><summary>All node changes</summary>', '', '| Change | Type | Node | Detail |', '| --- | --- | --- | --- |',
      ...g.added.map(n => `| + | ${n.type} | ${code(n.id)} | ${code(n.evidence)} |`), ...g.removed.map(n => `| − | ${n.type} | ${code(n.id)} | ${code(n.evidence)} |`),
      ...g.changed.map(n => `| ~ | ${n.type} | ${code(n.id)} | ${n.keys.join(', ')} |`), '', '</details>', '')
  }
  return { md: L.join('\n'), bad: h.bad }
}

module.exports = { render, headline, mermaid }
