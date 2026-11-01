#!/usr/bin/env node
// The stage list (lib/stages.js) as documentation and as a recorder for CI steps:
//   node bin/stages.js md                         print docs/stages.md
//   node bin/stages.js write                      write docs/stages.md
//   node bin/stages.js check                      exit 1 when docs/stages.md differs from lib/stages.js
//   node bin/stages.js record <out> <id> <status> [said]   add a CI stage (run-tests ...) to <out>/manifest.json
//   node bin/stages.js show <out>                 what ran in a run, from its manifest
const fs = require('fs')
const path = require('path')
const { STAGES, MODES, byId } = require('../lib/stages')
const manifest = require('../lib/manifest')

const DOC = path.join(__dirname, '..', 'docs', 'stages.md')
const WHEN = { pipeline: 'bin/pipeline.js', ci: 'CI only', 'on-demand': 'on demand', 'by-hand': 'by an AI agent or a person' }
const METHOD = { static: 'static', measured: '**measured**', ai: '**AI**' }
const cell = s => String(s).replace(/\|/g, '\\|')
const code = l => l.map(x => `\`${x}\``).join(', ')

function md() {
  const id = s => s.id.replace(/[^a-z0-9]/g, '_')
  const order = ['intake', 'discover', 'facts', 'findings', 'tests', 'atlas', 'ai-requests', 'validate', 'run-tests', 'after-tests', 'ai-answer', 'ai-merge']
  const flow = [
    'flowchart LR',
    '  classDef static fill:#e8f0fe,stroke:#3367d6', '  classDef measured fill:#e6f4ea,stroke:#188038', '  classDef ai fill:#fef7e0,stroke:#b06000',
    '  subgraph P["bin/pipeline.js (static, no install)"]', ...['discover', 'facts', 'findings', 'tests', 'atlas', 'ai-requests', 'validate'].map(s => `    ${id(byId(s))}["${byId(s).title}"]`), '  end',
    '  subgraph C["CI only (app installed and running)"]', ...['intake', 'run-tests', 'after-tests'].map(s => `    ${id(byId(s))}["${byId(s).title}"]`), '  end',
    '  subgraph A["AI pass (optional, mode static+ai)"]', ...['ai-answer', 'ai-merge'].map(s => `    ${id(byId(s))}["${byId(s).title}"]`), '  end',
    '  intake --> discover --> facts --> findings --> tests --> atlas --> ai_requests --> validate',
    '  validate --> run_tests --> after_tests', '  ai_requests -. "run/ai/requests" .-> ai_answer -. "run/ai/answers" .-> ai_merge', '  after_tests -. "findings again" .-> findings', '  ai_merge -. "findings again" .-> findings',
    ...STAGES.map(s => `  class ${id(s)} ${s.method}`),
  ]
  return [
    '---', 'title: Stages of a discovery run', 'generated: by `node bin/stages.js write` from `lib/stages.js` (CI checks it is current)', '---', '',
    '# Stages: what runs when, what it reads and writes', '',
    'Every run is a fixed sequence of stages. Each one is listed here with its inputs, outputs and the switch that turns it off. A run records what really happened in `<out>/manifest.json` (status, start, seconds, outputs with sha256); `node bin/stages.js show <out>` prints it.', '',
    '![stages](stages.png)', '',
    '```mermaid', ...flow, '```', '',
    '## Modes', '', '| Mode | What it means |', '| --- | --- |', ...Object.entries(MODES).map(([k, v]) => `| \`${k}\` | ${v} |`), '',
    'Set it with `--mode`, `DISCOVERY_MODE`, or `"mode"` in `discovery.config.json` (in that order). The default is `static`. Measured results (CI) are independent of the mode: they come from the running app, not from an AI.', '',
    '## Stage table', '', '| # | Stage | When | Method | Switch | Reads | Writes |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...order.map((o, i) => { const s = byId(o); return `| ${i + 1} | **${s.id}** ${cell(s.title)} | ${WHEN[s.when]} | ${METHOD[s.method]} | ${s.switch ? `\`${s.switch}\`` : 'always'} | ${cell(s.in.join(', '))} | ${cell(s.out.join(', '))} |` }),
    '', '## Each stage', '',
    ...order.flatMap(o => { const s = byId(o); return [`### ${s.id}: ${s.title}`, '', s.does, '', `- **When:** ${WHEN[s.when]} · **method:** ${s.method} · **switch:** ${s.switch || 'always on'} · **walkthrough:** piece ${s.piece}`, `- **Code:** ${code(s.code)}`, `- **Reads:** ${s.in.map(x => `\`${x}\``).join(', ')}`, `- **Writes:** ${s.out.map(x => `\`${x}\``).join(', ')}`, ...(s.schemas ? [`- **Schemas:** ${code(s.schemas)}`] : []), ''] }),
    '## The three layers of a finished run', '',
    '| Layer | Files | For |', '| --- | --- | --- |',
    '| Facts | `run/graph/*.jsonl`, `run/csn.json`, `run/project.json`, `run/edmx/` | what the app consists of: every node and edge with `file:line`, source tool and confidence |',
    '| Findings and gaps (middle layer) | `run/findings/findings.jsonl`, `gaps.jsonl`, `summary.json`, `README.md` | every judgement with evidence, method (static, measured, ai, human) and status; every open question with who can settle it |',
    '| Presentation | `atlas/`, `atlas-data.json`, `docs/`, `pr/*.md` | people: Markdown with images, the interactive page, PR comments |', '',
    'An AI pass reads the middle layer (via `run/ai/requests/`) and writes back into it (`run/findings/ai.jsonl`); it never edits the facts or the atlas directly.', '',
  ].join('\n')
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'md') process.stdout.write(md())
else if (cmd === 'write') { fs.writeFileSync(DOC, md()); console.log(`written ${DOC}`) }
else if (cmd === 'check') {
  const now = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : ''
  if (now !== md()) { console.error('docs/stages.md is out of date: run node bin/stages.js write'); process.exit(1) }
  console.log('docs/stages.md is current')
} else if (cmd === 'record') {
  const [out, id, status, ...said] = rest
  if (!out || !byId(id) || !['ran', 'off', 'skipped', 'failed'].includes(status)) { console.error('usage: stages.js record <out> <stage id> ran|off|skipped|failed [said]'); process.exit(2) }
  const M = manifest.read(path.resolve(out))
  if (!M) { console.error(`no manifest in ${out}`); process.exit(0) }
  manifest.record(M, { id, status, started: new Date().toISOString(), ...(said.length ? { said: said.join(' ') } : {}), outputs: manifest.outputs(path.resolve(out), id) })
  manifest.save(path.resolve(out), M)
  console.log(`${id}: ${status}`)
} else if (cmd === 'show') {
  const M = manifest.read(path.resolve(rest[0] || ''))
  if (!M) { console.error('usage: stages.js show <out> (no manifest.json there)'); process.exit(2) }
  console.log(`mode ${M.mode} · app ${M.app.name} @ ${String(M.app.commit).slice(0, 7)} · toolkit ${String(M.toolkit.commit).slice(0, 7)}`)
  for (const s of M.stages) console.log(`${s.status.padEnd(8)} ${s.id.padEnd(12)} ${(s.method || '').padEnd(9)} ${s.seconds != null ? `${s.seconds}s`.padStart(7) : '       '}  ${s.said || s.why || ''}`)
} else { console.error('usage: stages.js md | write | check | record <out> <id> <status> [said] | show <out>'); process.exit(2) }
