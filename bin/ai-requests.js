#!/usr/bin/env node
// Stage "ai-requests" (mode static+ai): one self-contained request per open gap an AI can settle. No LLM
// is called here; the files are the hand-over to an AI pass that may run later, elsewhere, or never.
//   node bin/ai-requests.js <out> [--all]      (--all: also gaps already answered by AI)
// Writes run/ai/requests/<gap id>.md (question, why static analysis could not answer, what the run
// knows, code excerpts, answer format), run/ai/requests/index.json and run/ai/README.md.
// Answers go to run/ai/answers/<gap id>.json (schema/ai-answer.schema.json); bin/ai-merge.js gates them.
// Stages: lib/stages.js · Walkthrough: docs/walkthrough/12-ai-loop.md, 13-findings-and-gaps.md
const fs = require('fs')
const path = require('path')
const { readJsonl } = require('../lib/findings')

const EXCERPT = 6        // lines before and after a cited line
const MAX_EXCERPTS = 4

const args = process.argv.slice(2)
const out = path.resolve(args.find(a => !a.startsWith('--')) || '')
const run = path.join(out, 'run'), dir = path.join(run, 'findings')
if (!fs.existsSync(path.join(dir, 'gaps.jsonl'))) { console.error('usage: ai-requests <out> [--all]  (run/findings/gaps.jsonl missing: run the findings stage first)'); process.exit(2) }
const metrics = JSON.parse(fs.readFileSync(path.join(run, 'metrics.json'), 'utf8'))
const root = metrics.root
const gaps = readJsonl(path.join(dir, 'gaps.jsonl'))
const findings = new Map(readJsonl(path.join(dir, 'findings.jsonl')).map(f => [f.id, f]))
const nodes = new Map(readJsonl(path.join(run, 'graph', 'nodes.jsonl')).map(n => [n.id, n]))

function excerpt(file, line) {
  const abs = path.resolve(root, file)
  if (!fs.existsSync(abs)) return null
  const L = fs.readFileSync(abs, 'utf8').split('\n')
  const from = Math.max(1, (line || 1) - EXCERPT), to = Math.min(L.length, (line || 1) + EXCERPT + (line ? 0 : 20))
  const ext = path.extname(file).slice(1)
  return [`\`${file}\` lines ${from}-${to}:`, '', '```' + ext, ...L.slice(from - 1, to).map((t, i) => `${String(from + i).padStart(4)}  ${t}`), '```', ''].join('\n')
}

const props = n => Object.entries(n.props || {}).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length) && typeof v !== 'object').slice(0, 8).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(', ')

const todo = gaps.filter(g => g.resolvableBy.includes('ai') && (g.status === 'open' || (args.includes('--all') && g.status === 'answered')))
const rdir = path.join(run, 'ai', 'requests')
fs.rmSync(rdir, { recursive: true, force: true })
fs.mkdirSync(rdir, { recursive: true })
fs.mkdirSync(path.join(run, 'ai', 'answers'), { recursive: true })
const index = []
for (const g of todo) {
  const about = g.about.map(id => findings.get(id)).filter(Boolean)
  const subj = g.subjects.map(id => nodes.get(id)).filter(Boolean)
  const md = [
    `# ${g.id}`, '', `**Question:** ${g.question}`, '',
    `Kind \`${g.kind}\` · priority ${g.priority} · can also be settled by: ${g.resolvableBy.filter(r => r !== 'ai').join(', ') || 'nobody else'}`, '',
    '## Why static analysis could not answer', '', g.why, '',
    '## What the run already knows', '',
    ...(about.length ? about.map(f => `- **${f.title}** (\`${f.id}\`, ${f.method}, ${f.status}): ${f.statement}${f.evidence.length ? ` Evidence: ${f.evidence.map(e => `\`${e.file}:${e.line}\``).join(', ')}.` : ''}`) : ['- No finding yet; the gap comes from the structure of the app.']),
    ...(subj.length ? ['', 'Graph nodes (`run/graph/nodes.jsonl`):', '', ...subj.slice(0, 12).map(n => `- \`${n.id}\` ${n.type}${n.evidence ? ` at \`${n.evidence}\`` : ''}${props(n) ? `: ${props(n)}` : ''}`)] : []),
    ...(g.data?.questions ? ['', 'Questions for this slice:', '', ...g.data.questions.map(q => `- ${q}`), '', `Full brief: \`node bin/brief.js ${path.relative(process.cwd(), run) || run} ${root} ${g.data.slice}\``] : []),
    ...(g.data?.ai ? ['', `An earlier AI answer (${g.data.ai.status}, not accepted: no evidence passed the gate): ${g.data.ai.answer}`] : []),
    '', '## Read first', '',
    ...g.look.map(l => `- \`${l.file}${l.line ? ':' + l.line : ''}\`${l.why ? ` (${l.why})` : ''}`), '',
    ...g.look.filter(l => l.line).slice(0, MAX_EXCERPTS).map(l => excerpt(l.file, l.line)).filter(Boolean),
    '## Answer', '',
    `What a good answer contains: ${g.expects || 'findings with file:line evidence, or "unknown"'}.`, '',
    `Write \`run/ai/answers/${g.id}.json\` (schema \`schema/ai-answer.schema.json\`):`, '',
    '```json', JSON.stringify({ gap: g.id, agent: 'gap-resolver', status: 'answered', answer: 'One or two plain sentences answering the question.', findings: [{ title: 'Short label', statement: 'What is true and why it matters.', confidence: 'medium', evidence: [{ file: 'srv/example.js', line: 42, quote: 'verbatim text from that line' }], test: 'the request that would show it' }] }, null, 2), '```', '',
    'Rules: every finding needs evidence whose `quote` is verbatim text within two lines of `line` (else it is rejected); paths are relative to the app root; say `"status": "unknown"` with an empty `findings` list when the code does not show the answer, and name in `answer` what would (a request, a person).', '',
  ].join('\n')
  fs.writeFileSync(path.join(rdir, `${g.id}.md`), md)
  index.push({ gap: g.id, kind: g.kind, priority: g.priority, status: g.status, question: g.question, request: `requests/${g.id}.md`, answer: `answers/${g.id}.json`, answered: fs.existsSync(path.join(run, 'ai', 'answers', `${g.id}.json`)) })
}
fs.writeFileSync(path.join(rdir, 'index.json'), JSON.stringify(index, null, 1))
fs.writeFileSync(path.join(run, 'ai', 'README.md'), [
  '# AI pass: requests and answers', '',
  `${index.length} open gaps can be worked on by an AI (${['high', 'medium', 'low'].map(p => `${index.filter(r => r.priority === p).length} ${p}`).join(', ')}). The static run is complete without them; this folder is the hand-over.`, '',
  '1. Pick requests from `requests/index.json` (highest priority first). Each `requests/<gap>.md` is self-contained.',
  '2. An AI agent (Claude Code: `agents/gap-resolver.md`) reads the request and the app source, and writes `answers/<gap>.json` (schema `schema/ai-answer.schema.json`).',
  '3. `node bin/ai-merge.js <out>` accepts a finding only when its quote is on the cited line, writes `run/findings/ai.jsonl`, rebuilds `run/findings/` in mode static+ai and validates. Rejections are listed in `merge-log.json`.',
  '4. AI findings stay `suspected` and their gaps `answered` until a measurement or a person settles them.', '',
  '| Priority | Gap | Question | Answered |', '| --- | --- | --- | --- |',
  ...index.map(r => `| ${r.priority} | [\`${r.gap}\`](${r.request}) | ${r.question.replace(/\|/g, '\\|')} | ${r.answered ? 'yes' : ''} |`), ''].join('\n'))
console.log(`ai requests: ${index.length} written → ${rdir} (${index.filter(r => r.answered).length} already answered)`)
