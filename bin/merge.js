#!/usr/bin/env node
// Validates agent facts and merges the accepted ones into the graph:
//   node bin/merge.js <run-dir> <app-root> <slice-id>
// Reads slices/<id>/facts/*.json. A fact is accepted only when its evidence points at an existing
// file and line and its quote appears within two lines of it. Rejected facts are listed in the
// merge log so the agent can be asked again; they never reach the graph.
const fs = require('fs')
const path = require('path')
const { loadRun, findSlice, saveGraph } = require('../lib/load')

const norm = s => s.replace(/\s+/g, ' ').trim()

function checkEvidence(root, evidence, quote) {
  const m = /^(.+):(\d+)$/.exec(evidence || '')
  if (!m) return 'evidence is not path:line'
  const file = path.join(root, m[1])
  if (!fs.existsSync(file)) return `file ${m[1]} does not exist`
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const line = +m[2]
  if (line < 1 || line > lines.length) return `line ${line} outside ${m[1]} (${lines.length} lines)`
  if (!quote || quote.length < 8) return 'quote missing or shorter than 8 characters'
  const window = norm(lines.slice(Math.max(0, line - 3), line + 2).join(' '))
  return window.includes(norm(quote)) ? null : `quote not found near ${evidence}`
}

function main() {
  const [runDir, root, id] = process.argv.slice(2)
  const { g, slices } = loadRun(runDir)
  const { slice } = findSlice(slices, id)
  const dir = path.join(runDir, 'slices', slice.id)
  const files = fs.readdirSync(path.join(dir, 'facts')).filter(f => f.endsWith('.json'))
  const run = new Date().toISOString().slice(0, 16) + 'Z'
  const log = { run, accepted: 0, rejected: [], answers: {}, classes: [], risks: [] }

  // Nodes first, so edges in any file can point at nodes from any other file
  const all = files.flatMap(f => { const doc = JSON.parse(fs.readFileSync(path.join(dir, 'facts', f), 'utf8')); return doc.facts.map(x => ({ ...x, agent: doc.agent })) })
  all.sort((a, b) => (a.kind === 'node' ? 0 : 1) - (b.kind === 'node' ? 0 : 1))

  for (const f of all) {
    const meta = { source: `agent:${f.agent}`, confidence: f.confidence || 'medium' }
    const reject = why => log.rejected.push({ agent: f.agent, kind: f.kind, what: f.id || f.title || f.question || f.on || `${f.from} ${f.rel} ${f.to}`, why })

    if (f.kind === 'answer') {
      if (f.status === 'unknown') { log.answers[f.question] = { status: 'unknown', agent: f.agent, answer: f.answer || null }; log.accepted++; continue }
      const errors = (f.evidence || []).map((e, i) => checkEvidence(root, e, (f.quotes || [])[i])).filter(Boolean)
      if (!f.evidence?.length) { reject('answer without evidence'); continue }
      if (errors.length) { reject(errors.join('; ')); continue }
      log.answers[f.question] = { status: 'answered', agent: f.agent, answer: f.answer, evidence: f.evidence }
      log.accepted++
      continue
    }

    const err = checkEvidence(root, f.evidence, f.quote)
    if (err) { reject(err); continue }
    meta.evidence = f.evidence

    if (f.kind === 'node') {
      const n = g.node(f.id, f.type, f.props || {}, meta)
      if (!n.slices.includes(slice.id)) n.slices.push(slice.id)
    } else if (f.kind === 'edge') {
      if (!g.nodes.has(f.from) || !g.nodes.has(f.to)) { reject(`unknown endpoint ${!g.nodes.has(f.from) ? f.from : f.to}`); continue }
      g.edge(f.from, f.rel, f.to, f.props || {}, meta)
    } else if (f.kind === 'classes') {
      log.classes.push({ on: f.on, technique: f.technique, classes: f.classes, evidence: f.evidence, agent: f.agent, confidence: meta.confidence })
      const cid = `classes:${slice.id}:${log.classes.length}`
      g.node(cid, 'ClassGroup', { on: f.on, technique: f.technique, count: f.classes.length }, meta).slices.push(slice.id)
      if (g.nodes.has(f.on)) g.edge(f.on, 'partitioned_into', cid, {}, meta)
    } else if (f.kind === 'risk') {
      log.risks.push({ title: f.title, severity: f.severity, description: f.description, evidence: f.evidence, agent: f.agent, test: f.test })
      const rid = `risk:${slice.id}:${log.risks.length}`
      g.node(rid, 'Risk', { title: f.title, severity: f.severity, description: f.description }, meta).slices.push(slice.id)
    } else { reject(`unknown kind ${f.kind}`); continue }
    log.accepted++
  }

  saveGraph(runDir, g)
  fs.writeFileSync(path.join(dir, 'merge-log.json'), JSON.stringify(log, null, 2))
  const answered = Object.values(log.answers).filter(a => a.status === 'answered').length
  console.log(`${slice.id}: ${log.accepted} accepted, ${log.rejected.length} rejected, checklist ${answered}/10 answered, ${Object.keys(log.answers).length - answered} unknown`)
  for (const r of log.rejected) console.log(`  rejected (${r.agent}) ${r.what}: ${r.why}`)
}

main()
