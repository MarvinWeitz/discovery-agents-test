// Renders the human-readable Phase 1 report (Markdown + Mermaid) from the graph.
// Step 6 · Walkthrough: docs/walkthrough/06-slices.md
// ids without the node type and without the app's own namespaces (the namespaces of its db entities, longest first)
let NS = []
const short = id => { const s = id.replace(/^[a-z0-9]+:/, ''); const ns = NS.find(n => s.startsWith(n)); return ns ? s.slice(ns.length) : s }
const namespaces = g => {
  const names = new Set(g.byType('Entity').map(n => n.props.name))
  // the prefix of a nested entity (Incidents.conversation) is an entity, not a namespace
  return [...new Set([...names].map(n => n.split('.').slice(0, -1).join('.')).filter(n => n && n !== 'sap.common' && !names.has(n)))].map(n => n + '.').sort((a, b) => b.length - a.length)
}
const mid = id => id.replace(/[^A-Za-z0-9]/g, '_')
const pct = x => `${Math.round(x * 100)}%`

function overview(g) {
  // One box per service holding its entities, one box for the persistence layer; "exposes" is shown by containment
  const L = ['flowchart LR']
  const nodesOf = t => g.byType(t)
  for (const a of nodesOf('UI5App')) L.push(`  ${mid(a.id)}["UI5 app<br/>${a.props.id}"]`)
  const visibleSE = nodesOf('ServiceEntity').filter(n => !n.props.generated && !n.props.name.endsWith('.texts'))
  for (const s of nodesOf('Service')) {
    L.push(`  subgraph ${mid(s.id)}["${s.props.name} ${s.props.path}"]`)
    for (const e of visibleSE.filter(e => e.props.service === s.props.name)) L.push(`    ${mid(e.id)}["${e.props.name.replace(s.props.name + '.', '')}${e.props.draft ? ' (draft)' : ''}"]`)
    L.push('  end')
  }
  L.push('  subgraph persistence["Persistence"]')
  for (const e of nodesOf('Entity').filter(n => !n.props.name.endsWith('.texts'))) L.push(`    ${mid(e.id)}[("${e.props.name.split('.').pop()}")]`)
  L.push('  end')
  for (const x of nodesOf('ExternalService')) L.push(`  ${mid(x.id)}>"${x.props.name}"]`)
  for (const r of nodesOf('Role')) L.push(`  ${mid(r.id)}(("role ${r.props.name}"))`)
  const ids = new Set(L.map(l => l.trim().replace(/^subgraph\s+/, '').split(/[[{(>]/)[0]))
  const rels = { uses: 'uses', projects_on: '', composes: 'composes', requires: 'requires', connects_to: 'calls' }
  for (const e of g.edges.filter(e => e.rel in rels && ids.has(mid(e.from)) && ids.has(mid(e.to)))) {
    if (e.rel === 'composes' && g.nodes.get(e.from)?.type === 'ServiceEntity') continue // shown in the persistence layer
    L.push(rels[e.rel] ? `  ${mid(e.from)} -->|${rels[e.rel]}| ${mid(e.to)}` : `  ${mid(e.from)} --> ${mid(e.to)}`)
  }
  return L.join('\n')
}

function sliceFlow(g, s) {
  const L = ['flowchart TD']
  const label = n => {
    const p = n.props
    switch (n.type) {
      case 'Route': return `route ${p.name}<br/>${p.template?.split('.').pop() || ''}`
      case 'Handler': return `${p.phase} ${p.events.join('/')}<br/>${p.file}:${p.line}`
      case 'Rule': return p.kind === 'rejection' ? `reject if ${p.guard || '?'}` : `set ${p.field}${p.guard ? ` if ${p.guard}` : ''}`
      case 'ExistingTest': return `test ${p.file} (${p.cases})`
      default: return short(n.id)
    }
  }
  const show = ['UI5App', 'Route', 'ServiceEntity', 'Entity', 'Handler', 'Rule', 'Event', 'ExternalService', 'Role', 'Action']
  const members = s.members.map(id => g.nodes.get(id)).filter(n => n && show.includes(n.type) && !n.props.generated && !n.props.name?.endsWith?.('.texts'))
  const set = new Set(members.map(n => n.id))
  for (const n of members) L.push(`  ${mid(n.id)}["${label(n).replace(/"/g, "'")}"]`)
  const rels = ['has_route', 'shows', 'navigates_to', 'projects_on', 'composes', 'associates', 'handles', 'enforces', 'reads', 'writes', 'emits', 'requires', 'has_action']
  // Keep the picture readable: associations are drawn at the service layer only, and back-links of compositions are dropped
  const noise = e => e.rel === 'associates' && (g.nodes.get(e.from)?.type === 'Entity' || g.edges.some(x => x.rel === 'composes' && x.from === e.to && x.to === e.from))
  for (const e of g.edges.filter(e => rels.includes(e.rel) && set.has(e.from) && set.has(e.to) && !noise(e))) L.push(`  ${mid(e.from)} -->|${e.rel.replace('_', ' ')}| ${mid(e.to)}`)
  return L.join('\n')
}

function render({ app, commit, g, slices, cov, lint, config, classes, history, run }) {
  NS = namespaces(g)
  const t = (n, k) => g.byType(n).length
  const findings = g.byType('Finding')
  const errors = findings.filter(f => f.props.severity === 'error').length
  const totalClasses = classes.reduce((a, c) => a + c.classes.length, 0)
  const out = []
  out.push(`# Phase 1 discovery report: ${app}`)
  out.push('')
  out.push(`Run ${run} on commit \`${commit.slice(0, 10)}\`. Everything below was extracted by tools; no LLM was used. Facts from static code analysis are marked medium confidence and still need review.`)
  out.push('')
  out.push('## Headline')
  out.push('')
  out.push(`- **${slices.length} feature slices** cut from the model, ranked by risk. Top slice: **${slices[0]?.id} ${slices[0]?.name}** (risk ${slices[0]?.risk}).`)
  out.push(`- **Inventory coverage ${pct(cov.ratio)}**: ${cov.assigned} of ${cov.inventory} inventory items belong to at least one slice.`)
  out.push(`- **Evidence ratio ${pct(cov.evidenceRatio)}**: share of graph facts with a file:line reference.`)
  out.push(`- **${findings.length} lint findings** (${errors} errors) from cds lint and UI5 linter.`)
  out.push(`- **${totalClasses} equivalence-class seeds** in ${classes.length} groups, derived from CDS constraints, roles, drafts and handler rules.`)
  out.push('')
  out.push('## Inventory')
  out.push('')
  out.push('| Item type | Count | In a slice |')
  out.push('| --- | --- | --- |')
  for (const [type, v] of Object.entries(cov.byType).sort((a, b) => b[1].total - a[1].total)) out.push(`| ${type} | ${v.total} | ${v.assigned} |`)
  out.push('')
  out.push(`Graph size: ${g.nodes.size} nodes, ${g.edges.length} edges. Git history: ${history.commits} commits. CAP plugins: ${(config.plugins || []).join(', ') || 'none'}. HDI artifacts: ${config.hdiArtifacts}. mta.yaml: ${config['mta.yaml'] ? 'yes' : 'no'}.`)
  out.push('')
  out.push('## Architecture overview (C4 level 2 to 3)')
  out.push('')
  out.push('Each service box holds the entities it exposes; arrows without a label mean "projects on" the persisted entity.')
  out.push('')
  out.push('```mermaid')
  out.push(overview(g))
  out.push('```')
  out.push('')
  out.push('## Slice catalog')
  out.push('')
  out.push('| Slice | Seed | Risk | Churn (commits) | Edges | Handlers | Rules | Routes | Existing tests |')
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const s of slices) {
    const c = type => s.members.filter(id => g.nodes.get(id)?.type === type).length
    out.push(`| ${s.id} | ${s.name} | ${s.risk} | ${s.factors.raw.churn} | ${s.factors.raw.centrality} | ${c('Handler')} | ${c('Rule')} | ${c('Route')} | ${c('ExistingTest')} |`)
    for (const p of s.subSlices || []) out.push(`| ${p.id} | ↳ ${p.name} | | | | ${p.handlers} | ${p.rules} | ${p.members.filter(id => g.nodes.get(id)?.type === 'Route').length} | |`)
  }
  if (slices.some(s => s.subSlices)) out.push('', 'Slices with more than 8 handlers are split into sub-slices, one per business-object node and per action. Sub-slices are the unit of the Phase 3 deep-dive.')
  out.push('')
  out.push('Risk = 0.3 churn + 0.25 centrality + 0.2 external calls + 0.15 events + 0.1 business criticality, each normalised to 0..1. Business criticality is a placeholder of 0.5 until the Phase 0 interview.')
  out.push('')
  for (const s of slices) {
    out.push(`### ${s.id} ${s.name}`)
    out.push('')
    for (const part of s.subSlices || [s]) {
      if (s.subSlices) out.push(`#### ${part.id} ${part.name}`, '')
      out.push('```mermaid')
      out.push(sliceFlow(g, part))
      out.push('```')
      out.push('')
    }
    out.push(`Files: ${s.files.map(f => `\`${f}\``).join(', ')}`)
    out.push('')
  }
  out.push('## Equivalence-class seeds')
  out.push('')
  out.push('| On | Technique | Classes | Evidence |')
  out.push('| --- | --- | --- | --- |')
  for (const c of classes) out.push(`| ${short(c.on)} | ${c.technique} | ${c.classes.map(x => x.name.replace(/\|/g, '\\|')).join('<br/>')} | \`${c.evidence}\` |`)
  out.push('')
  out.push('## Lint findings')
  out.push('')
  out.push('| Tool | Severity | Rule | Where | Message |')
  out.push('| --- | --- | --- | --- | --- |')
  for (const f of findings.sort((a, b) => (a.props.severity > b.props.severity ? 1 : -1))) out.push(`| ${f.props.tool} | ${f.props.severity} | ${f.props.rule} | \`${f.evidence}\` | ${f.props.message.replace(/\|/g, '\\|')} |`)
  out.push('')
  out.push('## Not in any slice')
  out.push('')
  out.push(cov.unassigned.length ? cov.unassigned.map(u => `- ${u.type} \`${short(u.id)}\` (${u.evidence})`).join('\n') : 'Nothing: every inventory item is in a slice.')
  out.push('')
  out.push('## What tools cannot tell us (Phase 0 questions)')
  out.push('')
  out.push('- Which slice matters most to the business (sets the criticality factor).')
  out.push('- The intended architecture and coding rules, so the reflexion check can flag violations.')
  out.push(`- ${cov.toVerify} medium- or low-confidence facts from static analysis to spot-check.`)
  return out.join('\n') + '\n'
}

module.exports = { render }
