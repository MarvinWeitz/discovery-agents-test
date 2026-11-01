#!/usr/bin/env node
// Stage "validate": checks that a run's machine-readable output is complete and consistent, so a
// static-only run can be trusted on its own and an AI pass can rely on it.
//   node bin/validate.js <out>
// Checks: manifest.json, findings.jsonl, gaps.jsonl, ai.jsonl and run/ai/answers/*.json against their
// JSON Schemas; ids unique; every link between findings and gaps resolves; subjects exist in the graph;
// evidence files exist in the app and the line is inside the file; mode "static" holds no AI finding.
// Exit 1 with one line per problem. Stages: lib/stages.js · Walkthrough: docs/walkthrough/13-findings-and-gaps.md
const fs = require('fs')
const path = require('path')
const { check } = require('../lib/schema')

const out = path.resolve(process.argv[2] || '')
const run = path.join(out, 'run')
if (!fs.existsSync(path.join(run, 'metrics.json'))) { console.error('usage: validate <out>  (<out>/run/metrics.json missing)'); process.exit(2) }
const problems = []
const P = s => problems.push(s)
const readJson = (f, where) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { P(`${where}: not JSON (${e.message.split('\n')[0]})`); return null } }
const readJsonl = (f, where) => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => [l, i + 1]).filter(([l]) => l.trim()).map(([l, n]) => { try { return JSON.parse(l) } catch { P(`${where}:${n}: not JSON`); return null } }).filter(Boolean)

const metrics = readJson(path.join(run, 'metrics.json'), 'run/metrics.json')
const root = metrics?.root
const M = fs.existsSync(path.join(out, 'manifest.json')) ? readJson(path.join(out, 'manifest.json'), 'manifest.json') : null
if (M) problems.push(...check('manifest', M, 'manifest.json'))
const mode = M?.mode || 'static'
const findingsOff = M?.stages?.some(s => s.id === 'findings' && s.status === 'off')

// graph node ids, for subjects
const nodes = new Set()
const nf = path.join(run, 'graph', 'nodes.jsonl')
if (fs.existsSync(nf)) for (const n of readJsonl(nf, 'run/graph/nodes.jsonl')) nodes.add(n.id)
else P('run/graph/nodes.jsonl missing')

// evidence inside the app: file exists, line within it (cached line counts)
const lines = new Map()
function evidenceOk(e, where) {
  if (!root) return
  const abs = path.resolve(root, e.file)
  if (!lines.has(abs)) lines.set(abs, fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs, 'utf8').split('\n').length : -1)
  const n = lines.get(abs)
  if (n < 0) P(`${where}: evidence file ${e.file} not in the app`)
  else if (e.line > n) P(`${where}: evidence ${e.file}:${e.line} past the end (${n} lines)`)
}

const dir = path.join(run, 'findings')
const counts = { findings: 0, gaps: 0, ai: 0, answers: 0 }
if (!findingsOff) {
  for (const f of ['findings.jsonl', 'gaps.jsonl', 'summary.json', 'README.md']) if (!fs.existsSync(path.join(dir, f))) P(`run/findings/${f} missing (findings stage did not run?)`)
  const F = fs.existsSync(path.join(dir, 'findings.jsonl')) ? readJsonl(path.join(dir, 'findings.jsonl'), 'findings.jsonl') : []
  const G = fs.existsSync(path.join(dir, 'gaps.jsonl')) ? readJsonl(path.join(dir, 'gaps.jsonl'), 'gaps.jsonl') : []
  counts.findings = F.length; counts.gaps = G.length
  const fid = new Map(), gid = new Map()
  F.forEach((f, i) => { problems.push(...check('finding', f, `findings.jsonl:${i + 1}`)); if (fid.has(f.id)) P(`findings.jsonl:${i + 1}: duplicate id ${f.id}`); fid.set(f.id, f) })
  G.forEach((g, i) => { problems.push(...check('gap', g, `gaps.jsonl:${i + 1}`)); if (gid.has(g.id)) P(`gaps.jsonl:${i + 1}: duplicate id ${g.id}`); gid.set(g.id, g) })
  for (const f of F) {
    const w = `finding ${f.id}`
    for (const g of f.gaps || []) if (!gid.has(g)) P(`${w}: raises unknown gap ${g}`)
    for (const g of f.resolves || []) if (!gid.has(g)) P(`${w}: resolves unknown gap ${g}`)
    for (const a of f.about || []) if (!fid.has(a)) P(`${w}: about unknown finding ${a}`)
    for (const s of f.subjects || []) if (!nodes.has(s)) P(`${w}: subject ${s} not in the graph`)
    for (const e of f.evidence || []) evidenceOk(e, w)
    if (f.method === 'ai' && mode === 'static') P(`${w}: AI finding in a static-mode run`)
    if (f.method === 'ai' && (f.evidence || []).some(e => !e.quote)) P(`${w}: AI evidence without a quote`)
  }
  for (const g of G) {
    const w = `gap ${g.id}`
    for (const a of g.about) if (!fid.has(a)) P(`${w}: about unknown finding ${a}`)
    for (const r of g.resolvedBy || []) if (!fid.has(r)) P(`${w}: resolved by unknown finding ${r}`)
    if (g.status !== 'open' && !(g.resolvedBy || []).length) P(`${w}: status ${g.status} without resolvedBy`)
    for (const s of g.subjects) if (!nodes.has(s)) P(`${w}: subject ${s} not in the graph`)
    for (const l of g.look) if (l.line) evidenceOk(l, w)
  }
  const ai = path.join(dir, 'ai.jsonl')
  if (fs.existsSync(ai)) readJsonl(ai, 'ai.jsonl').forEach((f, i) => { counts.ai++; problems.push(...check('finding', f, `ai.jsonl:${i + 1}`)); if (f.method !== 'ai') P(`ai.jsonl:${i + 1}: method ${f.method}, expected ai`) })
}
const ans = path.join(run, 'ai', 'answers')
if (fs.existsSync(ans)) for (const f of fs.readdirSync(ans).filter(f => f.endsWith('.json'))) {
  counts.answers++
  const a = readJson(path.join(ans, f), `run/ai/answers/${f}`)
  if (a) { problems.push(...check('ai-answer', a, `run/ai/answers/${f}`)); if (a.gap && f !== `${a.gap}.json`) P(`run/ai/answers/${f}: file name should be ${a.gap}.json`) }
}

for (const p of problems.slice(0, 60)) console.error(`invalid: ${p}`)
if (problems.length > 60) console.error(`… ${problems.length - 60} more`)
console.log(`${problems.length ? `INVALID: ${problems.length} problems` : 'valid'} (mode ${mode}; ${counts.findings} findings, ${counts.gaps} gaps${counts.ai ? `, ${counts.ai} AI findings` : ''}${counts.answers ? `, ${counts.answers} AI answers` : ''}${M ? `, manifest with ${M.stages.length} stages` : ', no manifest'})`)
process.exit(problems.length ? 1 : 0)
