#!/usr/bin/env node
// Stage "ai-merge": folds the AI answers to gaps into the run, through the evidence gate.
//   node bin/ai-merge.js <out>
// Rebuilds run/findings/ in mode static+ai. The findings stage gates every run/ai/answers/<gap>.json
// (lib/ai/gate.js): schema, gap still in this run, every evidence file:line exists and its quote is
// within two lines of it. Accepted findings go to run/findings/ai.jsonl (method "ai", status "suspected",
// resolves the gap, which becomes "answered"); every answer and every rejection with its reason goes to
// run/ai/merge-log.json. Records the stages ai-answer (who answered, when) and ai-merge in manifest.json,
// then validates. Rerunning is safe: the same answers give the same result.
// Stages: lib/stages.js · Walkthrough: docs/walkthrough/12-ai-loop.md
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const manifest = require('../lib/manifest')
const { answersDir } = require('../lib/ai/gate')

const out = path.resolve(process.argv[2] || '')
const run = path.join(out, 'run'), dir = path.join(run, 'findings')
if (!fs.existsSync(path.join(dir, 'gaps.jsonl'))) { console.error('usage: ai-merge <out>  (run/findings/gaps.jsonl missing)'); process.exit(2) }
const metrics = JSON.parse(fs.readFileSync(path.join(run, 'metrics.json'), 'utf8'))
const started = new Date().toISOString(), t0 = Date.now()
const node = (f, ...a) => execFileSync(process.execPath, [path.join(__dirname, f), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim().split('\n').pop()

const t1 = Date.now(), said = node('findings.js', out, '--mode', 'static+ai')
const log = JSON.parse(fs.readFileSync(path.join(run, 'ai', 'merge-log.json'), 'utf8'))
const accepted = log.answers.reduce((n, a) => n + a.accepted, 0)
const rejected = log.answers.reduce((n, a) => n + a.rejected.length, 0)
const stale = log.answers.filter(a => a.stale).length
console.log(`ai merge: ${log.answers.length} answers, ${accepted} findings accepted, ${rejected} rejected${stale ? ` (${stale} answers for gaps this run no longer has)` : ''} → ${path.join(dir, 'ai.jsonl')}`)
for (const a of log.answers) for (const r of a.rejected) console.log(`  rejected ${a.file}${r.title ? ` "${r.title}"` : ''}: ${r.why}`)

// what ran when: the answers (by hand, in a Claude Code session or elsewhere), then this gate
const adir = answersDir(run)
const times = log.answers.map(a => { try { return fs.statSync(path.join(adir, a.file)).mtime.toISOString() } catch { return null } }).filter(Boolean).sort()
const who = [...new Set(log.answers.map(a => [a.agent, a.model].filter(Boolean).join(' · ')).filter(Boolean))]
const M = manifest.read(out) || manifest.start(out, { mode: 'static+ai', root: metrics.root, app: metrics.app, commit: metrics.commit })
M.mode = 'static+ai'
manifest.record(M, { id: 'ai-answer', status: log.answers.length ? 'ran' : 'skipped', ...(times.length ? { started: times[0] } : { why: 'no answers in run/ai/answers/' }), said: `${log.answers.length} answers${who.length ? ` by ${who.join(', ')}` : ''}${times.length ? `, last ${times[times.length - 1]}` : ''}`, outputs: manifest.outputs(out, 'ai-answer') })
manifest.record(M, { id: 'ai-merge', status: 'ran', started, seconds: +((Date.now() - t0) / 1000).toFixed(1), said: `${accepted} accepted, ${rejected} rejected; ${said}`, outputs: manifest.outputs(out, 'ai-merge') })
manifest.record(M, { id: 'findings', status: 'ran', started: new Date(t1).toISOString(), seconds: +((Date.now() - t1) / 1000).toFixed(1), said, outputs: manifest.outputs(out, 'findings') })
manifest.save(out, M)
console.log(said)
try { console.log(node('validate.js', out)) } catch { process.exit(1) }
