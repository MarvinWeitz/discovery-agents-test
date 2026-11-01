// The AI answer gate: turns run/ai/answers/<gap>.json into findings, but only the parts that pass.
// An answer must match schema/ai-answer.schema.json and name a gap this run has; each of its findings is
// accepted only when every evidence file:line exists in the app and its quote is within two lines of it
// (lib/evidence.js) and inside the toolkit's scope (no CAP Java sources). Accepted findings get method "ai", status "suspected" and resolve their gap, which
// the findings stage then marks "answered" (never "resolved").
// Used by the findings stage in mode static+ai (lib/findings/index.js), so every rebuild re-checks every
// answer against the current code, and by `bin/ai-pass.js check` for one answer before the merge.
// Walkthrough: docs/walkthrough/12-ai-loop.md (D8, D9)
const fs = require('fs')
const path = require('path')
const { checkEvidence, WINDOW } = require('../evidence')
const { check } = require('../schema')
const { findingId } = require('../findings/book')

// The toolkit's scope is CAP Node.js: a Java backend in the same repo is not analysed, so evidence there
// cannot settle a gap about the Node app (it may still be true; it is about a different runtime)
const OUT_OF_SCOPE = [{ re: /\.(java|kt)$/i, why: 'CAP Java source; the scope is CAP Node.js' }]
const outOfScope = file => OUT_OF_SCOPE.find(o => o.re.test(String(file || '')))

const answersDir = runDir => path.join(runDir, 'ai', 'answers')

function readAnswer(file) {
  try { return { a: JSON.parse(fs.readFileSync(file, 'utf8')) } } catch (e) { return { error: `not JSON: ${e.message.split('\n')[0]}` } }
}

// the lines around a cited line, so whoever wrote the evidence can see what is really there
function around(root, e) {
  const abs = path.resolve(root, e.file || '')
  if (!e.file || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null
  const L = fs.readFileSync(abs, 'utf8').split('\n')
  const from = Math.max(1, (e.line || 1) - WINDOW), to = Math.min(L.length, (e.line || 1) + WINDOW)
  return L.slice(from - 1, to).map((t, i) => `${String(from + i).padStart(5)}  ${t}`).join('\n')
}

// one answer -> { entry (for merge-log.json), accepted: [finding] }
// gaps: Map id -> gap; nodes: Set of graph node ids; file: the answer's file name
function gateAnswer({ a, error, file, gaps, nodes, root }) {
  if (error) return { entry: { file, accepted: 0, rejected: [{ why: error }] }, accepted: [] }
  const entry = { file, gap: a.gap, agent: a.agent, ...(a.model ? { model: a.model } : {}), status: a.status, answer: a.answer, accepted: 0, rejected: [] }
  const accepted = []
  const bad = check('ai-answer', a, file)
  if (bad.length) { entry.rejected.push({ why: bad.join('; ') }); return { entry, accepted } }
  if (file && file !== `${a.gap}.json`) { entry.rejected.push({ why: `file name should be ${a.gap}.json` }); return { entry, accepted } }
  const g = gaps.get(a.gap)
  if (!g) { entry.stale = true; entry.rejected.push({ why: `gap ${a.gap} is not in this run (code changed, or wrong id)` }); return { entry, accepted } }
  if (a.status === 'unknown' && a.findings.length) { entry.rejected.push({ why: 'status "unknown" must come with an empty findings list' }); return { entry, accepted } }
  for (const f of a.findings) {
    const errs = f.evidence.map(e => outOfScope(e.file) ? `${e.file} is out of scope (${outOfScope(e.file).why})` : checkEvidence(root, e, e.quote)).filter(Boolean)
    if (errs.length) { entry.rejected.push({ title: f.title, why: errs.join('; ') }); continue }
    accepted.push({
      id: findingId('ai-finding', `${a.gap}|${f.title}|${f.evidence.map(e => `${e.file}:${e.line}`).join(',')}`), kind: 'ai-finding', title: f.title, statement: f.statement,
      method: 'ai', source: `agent:${a.agent}`, status: 'suspected', confidence: f.confidence, ...(f.severity ? { severity: f.severity } : {}), ...(f.layer ? { layer: f.layer } : {}),
      evidence: f.evidence, subjects: [...new Set([...(f.subjects || []), ...g.subjects].filter(s => nodes.has(s)))], ...(f.test ? { test: f.test } : {}),
      gaps: [], resolves: [a.gap], ...(g.about.length ? { about: g.about } : {}), stage: 'ai-merge', data: { answer: a.answer, ...(a.model ? { model: a.model } : {}) },
    })
    entry.accepted++
  }
  return { entry, accepted }
}

// every answer in run/ai/answers -> { log, accepted }; same input, same output (sorted by file name)
function gateAll({ runDir, root, gaps, nodes }) {
  const dir = answersDir(runDir)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : []
  const log = { answers: [] }, accepted = []
  for (const file of files) {
    const r = gateAnswer({ ...readAnswer(path.join(dir, file)), file, gaps, nodes, root })
    log.answers.push(r.entry)
    accepted.push(...r.accepted)
  }
  // the same finding twice (two answers citing the same thing) is kept once
  const seen = new Set()
  return { log, accepted: accepted.filter(f => !seen.has(f.id) && seen.add(f.id)) }
}

module.exports = { gateAnswer, gateAll, readAnswer, around, answersDir, OUT_OF_SCOPE }
