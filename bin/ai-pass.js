#!/usr/bin/env node
// The AI pass on the open gaps, step by step. Nothing here calls an LLM: these commands prepare the work,
// hand out one exact prompt per gap, check each answer and report. The answering is done by an agent in
// the developer's own Claude Code session (skills/fill-gaps, agents/gap-resolver.md) or by anyone who
// writes the answer files; bin/ai-merge.js folds them in.
//
//   node bin/ai-pass.js plan   <out> [--limit N] [--priority high,medium] [--kind k,..] [--gap id,..] [--redo]
//        the requests still to answer, highest priority first, as JSON: gap, paths, and the agent prompt.
//        Writes the requests first when run/ai/requests/ is missing (works on a static run too).
//        --redo also hands out gaps whose answer was rejected or "unknown".
//   node bin/ai-pass.js prompt <out> <gap>     the prompt for one gap (what the agent is told)
//   node bin/ai-pass.js check  <out> <gap>     gate one answer now, without merging: schema, gap, every quote
//        on its line. Prints what passed, what failed and the real lines at each failed citation.
//        Exit 1 when anything is rejected, so the agent can be asked once more.
//   node bin/ai-pass.js status <out> [--json]  every request and its state: pending, unmerged, accepted,
//        rejected, unknown; plus answers for gaps this run no longer has (stale)
//
// <out> is the pipeline's out folder (portable mode: .discovery). Stages: lib/stages.js ·
// Walkthrough: docs/walkthrough/12-ai-loop.md (D8, D9)
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { readJsonl } = require('../lib/findings')
const { gateAnswer, readAnswer, around, answersDir } = require('../lib/ai/gate')

const TOOLKIT = path.join(__dirname, '..')
const argv = process.argv.slice(2)
const VALUED = new Set(['--limit', '--priority', '--kind', '--gap'])
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
const pos = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]))
const [cmd, outArg, gapArg] = pos
const usage = () => { console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(1).filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); process.exit(2) }
if (!cmd || !outArg) usage()
const out = path.resolve(outArg)
const run = path.join(out, 'run'), fdir = path.join(run, 'findings'), rdir = path.join(run, 'ai', 'requests'), adir = answersDir(run)
if (!fs.existsSync(path.join(fdir, 'gaps.jsonl'))) { console.error(`no findings in ${out}: run the pipeline first (cap-discovery run)`); process.exit(2) }
const metrics = JSON.parse(fs.readFileSync(path.join(run, 'metrics.json'), 'utf8'))
const root = metrics.root
const gapsList = readJsonl(path.join(fdir, 'gaps.jsonl'))
const gaps = new Map(gapsList.map(g => [g.id, g]))
const nodes = new Set(readJsonl(path.join(run, 'graph', 'nodes.jsonl')).map(n => n.id))
const PRI = { high: 0, medium: 1, low: 2 }

function ensureRequests() {
  if (fs.existsSync(path.join(rdir, 'index.json'))) return
  console.error('[ai-pass] no requests yet; writing them (bin/ai-requests.js)')
  execFileSync(process.execPath, [path.join(__dirname, 'ai-requests.js'), out], { stdio: ['ignore', 'ignore', 'inherit'] })
}
const index = () => { ensureRequests(); return JSON.parse(fs.readFileSync(path.join(rdir, 'index.json'), 'utf8')) }
const mergeLog = () => { try { return JSON.parse(fs.readFileSync(path.join(run, 'ai', 'merge-log.json'), 'utf8')) } catch { return null } }

// the state of one gap's answer: pending | unmerged | accepted | rejected | unknown
function stateOf(id, log) {
  const file = path.join(adir, `${id}.json`)
  if (!fs.existsSync(file)) return { state: 'pending' }
  const e = log?.answers.find(a => a.file === `${id}.json`)
  if (!e || fs.statSync(file).mtimeMs > Date.parse(log.run || 0)) return { state: 'unmerged' }
  if (e.accepted) return { state: 'accepted', accepted: e.accepted, rejected: e.rejected.length }
  if (e.status === 'unknown' && !e.rejected.length) return { state: 'unknown' }
  return { state: 'rejected', rejected: e.rejected.length, why: e.rejected.map(r => r.why).join('; ') }
}

function prompt(id) {
  const req = path.join(rdir, `${id}.md`), ans = path.join(adir, `${id}.json`)
  return [
    `Answer gap ${id} of a CAP discovery run.`,
    `- Request (your whole brief): ${req}`,
    `- App source, the root every evidence path is relative to: ${root}`,
    `- Write your answer to exactly this file, nothing else: ${ans}`,
    `- Answer format: ${path.join(TOOLKIT, 'schema', 'ai-answer.schema.json')}`,
    'Read only inside the app root; never edit app files. Every finding needs evidence whose quote is copied verbatim from the cited line (or within two lines of it). If the code does not show the answer, write status "unknown" with an empty findings list and say in "answer" what would settle it.',
    'When done, reply with one line: the status you wrote and the number of findings.',
  ].join('\n')
}

function plan() {
  const log = mergeLog()
  const want = (k, v) => { const s = opt(k); return !s || s.split(',').map(x => x.trim()).includes(v) }
  const redo = argv.includes('--redo')
  const limit = opt('--limit') ? +opt('--limit') : Infinity
  const items = index()
    .filter(r => want('--priority', r.priority) && want('--kind', r.kind) && want('--gap', r.gap))
    .map(r => ({ ...r, ...stateOf(r.gap, log) }))
    .filter(r => r.state === 'pending' || (redo && ['rejected', 'unknown'].includes(r.state)))
    .sort((a, b) => PRI[a.priority] - PRI[b.priority])
    .slice(0, limit)
    .map(r => ({ gap: r.gap, priority: r.priority, kind: r.kind, state: r.state, question: r.question, request: path.join(rdir, `${r.gap}.md`), answer: path.join(adir, `${r.gap}.json`), agent: 'gap-resolver', prompt: prompt(r.gap) }))
  fs.mkdirSync(adir, { recursive: true })
  console.log(JSON.stringify({ out, root, total: index().length, todo: items.length, items }, null, 1))
}

function checkOne(id) {
  const file = path.join(adir, `${id}.json`)
  if (!fs.existsSync(file)) { console.log(`${id}: no answer at ${file}`); process.exit(1) }
  const r = gateAnswer({ ...readAnswer(file), file: `${id}.json`, gaps, nodes, root })
  const e = r.entry
  console.log(`${id}: ${e.status || '?'} · ${e.accepted} finding${e.accepted === 1 ? '' : 's'} pass the gate, ${e.rejected.length} rejected`)
  for (const f of r.accepted) console.log(`  ok        "${f.title}" (${f.evidence.map(x => `${x.file}:${x.line}`).join(', ')})`)
  let a = null
  try { a = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  for (const x of e.rejected) {
    console.log(`  REJECTED  ${x.title ? `"${x.title}": ` : ''}${x.why}`)
    const f = a?.findings?.find(y => y.title === x.title)
    for (const ev of f?.evidence || []) {
      const t = around(root, ev)
      if (t && /not found near|outside/.test(x.why)) console.log(`    the app has at ${ev.file}:${ev.line}:\n${t.split('\n').map(l => '    ' + l).join('\n')}`)
    }
  }
  if (e.rejected.length) {
    const why = e.rejected.map(x => x.why).join(' ')
    if (/not found near|outside|does not exist/.test(why)) console.log('Fix: copy each quote verbatim from one of the lines shown (or move "line" to where the quote is), or drop the finding.')
    if (/out of scope/.test(why)) console.log('Fix: drop findings that rest on out-of-scope files; keep only evidence in the CAP Node.js app.')
    if (/must|should|required|not JSON|not in this run/.test(why)) console.log('Fix: correct the answer file to match schema/ai-answer.schema.json and the gap id in the prompt.')
    process.exit(1)
  }
}

function status() {
  const log = mergeLog()
  const rows = index().map(r => ({ gap: r.gap, priority: r.priority, kind: r.kind, question: r.question, ...stateOf(r.gap, log) }))
  // gaps answered by an accepted AI finding no longer get a request; show them from gaps.jsonl
  for (const g of gapsList) if (g.status === 'answered' && !rows.some(r => r.gap === g.id)) rows.push({ gap: g.id, priority: g.priority, kind: g.kind, question: g.question, ...stateOf(g.id, log) })
  const stale = (log?.answers || []).filter(a => a.stale).map(a => a.file)
  const count = s => rows.filter(r => r.state === s).length
  const S = { out, total: rows.length, pending: count('pending'), unmerged: count('unmerged'), accepted: count('accepted'), rejected: count('rejected'), unknown: count('unknown'), stale, lastMerge: log?.run || null }
  if (argv.includes('--json')) { console.log(JSON.stringify({ ...S, rows }, null, 1)); return }
  console.log(`AI pass on ${metrics.app || out}: ${S.total} gaps an AI can work on · ${S.accepted} accepted · ${S.unknown} unknown · ${S.rejected} rejected · ${S.unmerged} answered, not merged yet · ${S.pending} pending${stale.length ? ` · ${stale.length} stale answers` : ''}`)
  console.log(`last merge: ${S.lastMerge || 'never'}`)
  for (const r of rows.sort((a, b) => PRI[a.priority] - PRI[b.priority])) console.log(`  ${r.state.padEnd(9)} ${r.priority.padEnd(6)} ${r.gap.padEnd(36)} ${r.question.slice(0, 90)}`)
  if (S.unmerged) console.log('next: cap-discovery ai merge')
  else if (S.pending) console.log('next: answer the pending gaps (Claude Code: /cap-discovery:fill-gaps)')
}

switch (cmd) {
  case 'plan': plan(); break
  case 'prompt': if (!gapArg) usage(); console.log(prompt(gapArg)); break
  case 'check': if (!gapArg) usage(); checkOne(gapArg); break
  case 'status': status(); break
  default: usage()
}
