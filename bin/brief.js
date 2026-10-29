#!/usr/bin/env node
// Writes the brief a Phase 3 agent team starts from: node bin/brief.js <run-dir> <app-root> <slice-id>
// The brief is the agents' whole context besides the source files it lists.
const fs = require('fs')
const path = require('path')
const { loadRun, findSlice } = require('../lib/load')
const { walk } = require('../lib/extract-handlers')

const { QUESTIONS } = require('./brief-questions')

function main() {
  const [runDir, root, id] = process.argv.slice(2)
  const { g, slices } = loadRun(runDir)
  const { slice } = findSlice(slices, id)
  const members = slice.members.map(m => g.nodes.get(m)).filter(Boolean)
  const short = n => n.id.replace(/^[a-z0-9]+:/, '')

  // Annotation files: CDS files that annotate any service entity of the slice
  const names = members.filter(n => n.type === 'ServiceEntity').map(n => n.props.name.split('.').pop())
  const annotationFiles = walk(root, p => p.endsWith('.cds') && !p.includes(`${path.sep}xmpls${path.sep}`))
    .filter(f => new RegExp(`annotate\\s+[\\w.]*\\b(${names.join('|')})\\b`).test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(root, f))
  const files = [...new Set([...slice.files, ...annotationFiles])].filter(f => !f.startsWith('xmpls/'))

  const out = []
  out.push(`# Slice brief ${slice.id}: ${slice.name}`, '')
  out.push(`Risk ${slice.risk}. Agents: flow-tracer, behaviour-analyst, event-integration-analyst, then risk-reviewer. Write each agent's facts to \`slices/${slice.id}/facts/<agent>.json\` in the format of \`schema/facts.md\`.`, '')
  out.push('## Map digest', '')
  for (const s of slices) {
    out.push(`- ${s.id} ${s.name} (risk ${s.risk})${s.id === slice.id || (s.subSlices || []).some(p => p.id === slice.id) ? ' <- this slice' : ''}`)
    for (const p of s.subSlices || []) out.push(`  - ${p.id} ${p.name}`)
  }
  out.push('', '## Files to read', '')
  for (const f of files) {
    const lines = fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8').split('\n').length : 0
    out.push(`- \`${f}\` (${lines} lines)`)
  }
  out.push('', '## What the tools already know', '')
  const byType = {}
  for (const n of members) (byType[n.type] ||= []).push(n)
  for (const [type, list] of Object.entries(byType)) {
    if (['SourceFile'].includes(type)) continue
    out.push(`### ${type}`, '')
    for (const n of list) {
      const p = n.props
      const detail = type === 'Handler' ? `${p.phase} ${p.events.join('/')} on ${p.target || p.service}${p.drafts ? ' (drafts)' : ''}`
        : type === 'Rule' ? (p.kind === 'rejection' ? `reject if \`${p.guard}\`: "${p.message}"` : `derive ${p.field}${p.guard ? ` if \`${p.guard}\`` : ''}`)
        : type === 'Element' ? Object.entries(p).filter(([k]) => !['entity', 'name', 'type'].includes(k)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
        : type === 'ExistingTest' ? `${p.cases} cases`
        : type === 'ServiceEntity' ? [p.draft && 'draft', p.autoexposed && 'auto-exposed', p.codeList && 'code list'].filter(Boolean).join(', ')
        : ''
      out.push(`- \`${short(n)}\` ${detail} (${n.evidence}, ${n.confidence})`)
    }
    out.push('')
  }
  const reqs = g.edges.filter(e => e.rel === 'requires' && slice.members.includes(e.from))
  out.push('### Authorization', '')
  out.push(reqs.length ? reqs.map(e => `- \`${e.from.replace(/^[a-z]+:/, '')}\` requires ${e.to.replace('role:', '')} (${e.props.grant})`).join('\n') : '- No `@requires` or `@restrict` on any entity of this slice.')
  out.push('', '## Checklist', '', '| Id | Question | Agent |', '| --- | --- | --- |')
  for (const [q, text, agent] of QUESTIONS) out.push(`| ${q} | ${text} | ${agent} |`)
  out.push('')

  const dir = path.join(runDir, 'slices', slice.id)
  fs.mkdirSync(path.join(dir, 'facts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'brief.md'), out.join('\n'))
  console.log(`brief written: ${path.join(dir, 'brief.md')} (${files.length} files, ${members.length} members)`)
}

main()
