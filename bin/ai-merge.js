#!/usr/bin/env node
// Stage "ai-merge": gates the AI answers to gaps and folds the accepted findings into the run.
//   node bin/ai-merge.js <out>
// Reads run/ai/answers/<gap>.json (schema/ai-answer.schema.json). A finding is accepted only when every
// evidence file:line exists in the app and its quote is within two lines of it (lib/evidence.js); the
// rest goes to run/ai/merge-log.json with the reason. Accepted findings are written to
// run/findings/ai.jsonl (method "ai", status "suspected", resolves the gap), then the findings stage
// runs again in mode static+ai and the run is validated. Rerunning is safe: ai.jsonl is rebuilt from
// all answers each time. Stages: lib/stages.js · Walkthrough: docs/walkthrough/12-ai-loop.md
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { checkEvidence } = require('../lib/evidence')
const { check } = require('../lib/schema')
const { readJsonl } = require('../lib/findings')
const { findingId } = require('../lib/findings/book')
const manifest = require('../lib/manifest')

const out = path.resolve(process.argv[2] || '')
const run = path.join(out, 'run'), dir = path.join(run, 'findings'), adir = path.join(run, 'ai', 'answers')
if (!fs.existsSync(path.join(dir, 'gaps.jsonl'))) { console.error('usage: ai-merge <out>  (run/findings/gaps.jsonl missing)'); process.exit(2) }
const metrics = JSON.parse(fs.readFileSync(path.join(run, 'metrics.json'), 'utf8'))
const root = metrics.root
const gaps = new Map(readJsonl(path.join(dir, 'gaps.jsonl')).map(g => [g.id, g]))
const nodes = new Set(readJsonl(path.join(run, 'graph', 'nodes.jsonl')).map(n => n.id))
const started = new Date().toISOString(), t0 = Date.now()

const log = { run: started, answers: [] }
const accepted = []
const files = fs.existsSync(adir) ? fs.readdirSync(adir).filter(f => f.endsWith('.json')).sort() : []
for (const file of files) {
  let a
  try { a = JSON.parse(fs.readFileSync(path.join(adir, file), 'utf8')) } catch (e) { log.answers.push({ file, accepted: 0, rejected: [{ why: `not JSON: ${e.message.split('\n')[0]}` }] }); continue }
  const entry = { file, gap: a.gap, agent: a.agent, model: a.model, status: a.status, answer: a.answer, accepted: 0, rejected: [] }
  log.answers.push(entry)
  const bad = check('ai-answer', a, file)
  if (bad.length) { entry.rejected.push({ why: bad.join('; ') }); continue }
  const g = gaps.get(a.gap)
  if (!g) { entry.rejected.push({ why: `gap ${a.gap} is not in this run (code changed, or wrong id)` }); continue }
  for (const f of a.findings) {
    const errs = f.evidence.map(e => checkEvidence(root, e, e.quote)).filter(Boolean)
    if (errs.length) { entry.rejected.push({ title: f.title, why: errs.join('; ') }); continue }
    accepted.push({
      id: findingId('ai-finding', `${a.gap}|${f.title}|${f.evidence.map(e => `${e.file}:${e.line}`).join(',')}`), kind: 'ai-finding', title: f.title, statement: f.statement,
      method: 'ai', source: `agent:${a.agent}`, status: 'suspected', confidence: f.confidence, ...(f.severity ? { severity: f.severity } : {}), ...(f.layer ? { layer: f.layer } : {}),
      evidence: f.evidence, subjects: [...new Set([...(f.subjects || []), ...g.subjects].filter(s => nodes.has(s)))], ...(f.test ? { test: f.test } : {}),
      gaps: [], resolves: [a.gap], ...(g.about.length ? { about: g.about } : {}), stage: 'ai-merge', data: { answer: a.answer, ...(a.model ? { model: a.model } : {}) },
    })
    entry.accepted++
  }
}
fs.mkdirSync(path.join(run, 'ai'), { recursive: true })
fs.writeFileSync(path.join(dir, 'ai.jsonl'), accepted.map(f => JSON.stringify(f)).join('\n') + (accepted.length ? '\n' : ''))
fs.writeFileSync(path.join(run, 'ai', 'merge-log.json'), JSON.stringify(log, null, 1))
const rejected = log.answers.reduce((n, a) => n + a.rejected.length, 0)
console.log(`ai merge: ${files.length} answers, ${accepted.length} findings accepted, ${rejected} rejected → ${path.join(dir, 'ai.jsonl')}`)
for (const a of log.answers) for (const r of a.rejected) console.log(`  rejected ${a.file}${r.title ? ` "${r.title}"` : ''}: ${r.why}`)

// rebuild the findings with the AI layer, record both stages, validate
const node = (f, ...a) => execFileSync(process.execPath, [path.join(__dirname, f), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim().split('\n').pop()
const M = manifest.read(out) || manifest.start(out, { mode: 'static+ai', root, app: metrics.app, commit: metrics.commit })
M.mode = 'static+ai'
manifest.record(M, { id: 'ai-merge', status: 'ran', started, seconds: +((Date.now() - t0) / 1000).toFixed(1), said: `${accepted.length} accepted, ${rejected} rejected`, outputs: manifest.outputs(out, 'ai-merge') })
const t1 = Date.now(), said = node('findings.js', out, '--mode', 'static+ai')
manifest.record(M, { id: 'findings', status: 'ran', started: new Date(t1).toISOString(), seconds: +((Date.now() - t1) / 1000).toFixed(1), said, outputs: manifest.outputs(out, 'findings') })
manifest.save(out, M)
console.log(said)
try { console.log(node('validate.js', out)) } catch { process.exit(1) }
