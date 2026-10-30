#!/usr/bin/env node
// Generates the slice dossier from the merged graph and merge log: node bin/dossier.js <run-dir> <slice-id>
// The dossier is never written by hand; re-run after every merge.
const fs = require('fs')
const path = require('path')
const { loadRun, findSlice } = require('../lib/load')
const { renderDiagrams } = require('../lib/report/render-diagrams')
const { QUESTIONS } = require('./brief-questions')

const mid = id => id.replace(/[^A-Za-z0-9]/g, '_')
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const SEV = { high: 0, medium: 1, low: 2 }

function requestFlow(g, members) {
  const L = ['flowchart LR']
  const routes = members.filter(n => n.type === 'Route')
  const requests = members.filter(n => n.type === 'Request')
  const handlers = members.filter(n => n.type === 'Handler')
  for (const r of routes) L.push(`  ${mid(r.id)}["${r.props.name}<br/>${(r.props.template || '').split('.').pop()}"]`)
  for (const q of requests) L.push(`  ${mid(q.id)}("${q.props.method} ${q.id.split('/').pop()}")`)
  for (const h of handlers) L.push(`  ${mid(h.id)}[["${h.props.phase} ${h.props.events.join('/')}<br/>${h.props.file}:${h.props.line}"]]`)
  for (const r of members.filter(n => n.type === 'Rule')) L.push(`  ${mid(r.id)}{{"${(r.props.kind === 'rejection' ? 'reject: ' + (r.props.message || '') : 'derive ' + r.props.field).replace(/"/g, "'")}"}}`)
  const set = new Set(members.map(n => n.id))
  for (const e of g.edges.filter(e => ['triggers_request', 'runs', 'enforces'].includes(e.rel) && set.has(e.from) && set.has(e.to))) L.push(`  ${mid(e.from)} --> ${mid(e.to)}`)
  return L.join('\n')
}

function saveSequence(g, members) {
  // Sequence of the request that runs custom code (the save), in handler registration order
  const req = members.find(n => n.type === 'Request' && g.out(n.id, 'runs').length)
  if (!req) return null
  const hs = g.out(req.id, 'runs').map(e => ({ e, h: g.nodes.get(e.to) })).sort((a, b) => a.h.props.line - b.h.props.line)
  const L = ['sequenceDiagram', '  participant UI as Fiori elements', '  participant S as ProcessorService', '  participant DB as Database']
  L.push(`  UI->>S: ${req.props.method} ${req.props.path}`)
  for (const { e, h } of hs) {
    L.push(`  Note over S,DB: ${h.props.phase} ${h.props.events.join('/')}<br/>${h.props.file}:${h.props.line}${e.props?.when ? '<br/>' + e.props.when : ''}`)
    for (const r of g.out(h.id, 'reads')) L.push(`  S->>DB: read ${r.to.split('.').pop()} (${r.props.via})`)
    for (const r of g.out(h.id, 'enforces').map(x => g.nodes.get(x.to))) {
      if (r.props.kind === 'rejection') { L.push(`  alt ${r.props.label || r.props.guard}`, `    S-->>UI: error "${(r.props.message || '').replace(/[;#]/g, '')}"`, '  end') }
      else L.push(`  Note over S,DB: ${r.props.label || `${r.props.field} := derived${r.props.guard ? ' if ' + r.props.guard : ''}`}`)
    }
  }
  L.push('  S->>DB: write active Incidents + conversation', '  S-->>UI: saved incident')
  return L.join('\n')
}

async function main() {
  const [runDir, id] = process.argv.slice(2)
  const { g, slices } = loadRun(runDir)
  const { slice } = findSlice(slices, id)
  const dir = path.join(runDir, 'slices', slice.id)
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'merge-log.json'), 'utf8'))
  const members = [...g.nodes.values()].filter(n => n.slices.includes(slice.id) || slice.members.includes(n.id))

  const risks = [...log.risks].sort((a, b) => SEV[a.severity] - SEV[b.severity])
  const classes = log.classes.flatMap(c => c.classes.map(x => ({ ...x, on: c.on, technique: c.technique })))
  const covered = classes.filter(c => c.covered_by).length
  const weak = classes.filter(c => /cannot fail/.test(c.covered_by || '')).length
  const answered = QUESTIONS.filter(([q]) => log.answers[q]?.status === 'answered').length
  const agentFacts = [...g.nodes.values()].filter(n => n.source?.startsWith('agent:') && n.slices.includes(slice.id)).length

  const out = []
  out.push(`# Slice dossier ${slice.id}: ${slice.name}`, '')
  out.push(`Generated ${log.run} from the knowledge graph. Every statement links to the code; facts without valid evidence were rejected at merge.`, '')
  out.push('## At a glance', '')
  out.push('| Measure | Value |', '| --- | --- |')
  out.push(`| Checklist answered | ${answered} of ${QUESTIONS.length} |`)
  out.push(`| Agent facts accepted / rejected | ${log.accepted} / ${log.rejected.length} |`)
  out.push(`| Risks | ${risks.filter(r => r.severity === 'high').length} high, ${risks.filter(r => r.severity === 'medium').length} medium, ${risks.filter(r => r.severity === 'low').length} low |`)
  out.push(`| Equivalence classes | ${classes.length} in ${log.classes.length} groups |`)
  out.push(`| Classes with an existing test | ${covered} of ${classes.length} (${weak} of them by a test that cannot fail) |`)
  out.push('')
  out.push('## How requests reach the code', '')
  out.push('```mermaid', requestFlow(g, members), '```', '')
  const seq = saveSequence(g, members)
  if (seq) out.push('## What happens on save', '', '```mermaid', seq, '```', '')
  out.push('## Checklist', '')
  out.push('| Id | Question | Answer | Evidence |', '| --- | --- | --- | --- |')
  for (const [q, text] of QUESTIONS) {
    const a = log.answers[q]
    out.push(`| ${q} | ${esc(text)} | ${a ? esc(a.status === 'answered' ? a.answer : 'Unknown: ' + (a.answer || '')) : 'Not answered'} | ${(a?.evidence || []).map(e => `\`${e}\``).join('<br/>')} |`)
  }
  out.push('', '## Business rules', '')
  for (const r of members.filter(n => n.type === 'Rule')) {
    out.push(`- **${r.props.kind === 'rejection' ? 'Rejection' : 'Derivation'}** (\`${r.evidence}\`): ${r.props.business || (r.props.kind === 'rejection' ? `reject if ${r.props.guard}` : `derive ${r.props.field}`)}`)
    if (r.props.not_covered) out.push(`  Not covered: ${r.props.not_covered.join(', ')}.`)
  }
  out.push('', '## Risks', '')
  out.push('| Severity | Risk | Why | Test that would catch it | Evidence |', '| --- | --- | --- | --- | --- |')
  for (const r of risks) out.push(`| ${r.severity} | ${esc(r.title)} | ${esc(r.description)} | ${esc(r.test)} | \`${r.evidence}\` |`)
  out.push('', '## Equivalence classes', '')
  out.push('| On | Class | Kind | Input | Expected | Existing test |', '| --- | --- | --- | --- | --- | --- |')
  for (const c of classes) out.push(`| ${esc(c.on.replace(/^[a-z]+:/, ''))} | ${esc(c.name)} | ${c.kind} | ${esc(c.input)} | ${esc(c.expected)} | ${c.covered_by ? esc(c.covered_by) : '**none**'} |`)
  if (log.rejected.length) {
    out.push('', '## Rejected at merge', '')
    for (const r of log.rejected) out.push(`- ${r.agent}: ${esc(r.what)} (${esc(r.why)})`)
  }
  out.push('')
  const file = path.join(dir, 'dossier.md')
  fs.writeFileSync(file, out.join('\n'))
  const d = await renderDiagrams(file)
  console.log(`dossier written: ${file} (${d.rendered} diagrams, ${agentFacts} agent nodes)`)
}

main().catch(e => { console.error(e); process.exit(1) })
