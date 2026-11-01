// The middle layer: every finding of a run in one machine-readable file, every open question in another.
//   run/findings/findings.jsonl   one finding per line (schema/finding.schema.json)
//   run/findings/gaps.jsonl       one gap per line (schema/gap.schema.json)
//   run/findings/summary.json     counts by kind, method, status; gaps by who can settle them
//   run/findings/README.md        the same for people (and for an AI reading Markdown)
//   pr/findings.md                short summary for the job summary / PR comment
// Sources, in order: static collectors (lib/findings/static.js), addon hooks findings(book, ctx)
// (measured results after the tests ran), and in mode "static+ai" the AI findings that passed the
// evidence gate (lib/ai/gate.js, re-run on every rebuild; written to run/findings/ai.jsonl and
// run/ai/merge-log.json).
// Walkthrough: docs/walkthrough/13-findings-and-gaps.md
const fs = require('fs')
const path = require('path')
const { Book } = require('./book')
const { collectStatic } = require('./static')
const { check } = require('../schema')
const { gateAll } = require('../ai/gate')

const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }

// ctx: { g, csn, root, metrics, project, slices, D, runDir, out, mode, addons }
async function build(ctx) {
  const B = new Book('findings')
  collectStatic(B, ctx)
  for (const a of ctx.addons || []) if (a.findings) await a.findings(B, ctx)
  let ai = null
  if (ctx.mode === 'static+ai') {
    // every answer is gated again against this run's gaps and the current code, so an answer that no
    // longer holds (the code changed, the gap is gone) drops out instead of being guessed onto another
    const { accepted, log } = gateAll({ runDir: ctx.runDir, root: ctx.root, gaps: B.gaps, nodes: new Set(ctx.g.nodes.keys()) })
    for (const f of accepted) B.findings.set(f.id, { ...f, gaps: f.gaps || [] })
    // answers without accepted findings ("unknown", or claims without evidence) stay visible on the gap
    for (const a of log.answers) { const g = B.gaps.get(a.gap); if (g && !a.accepted) g.data = { ...(g.data || {}), ai: { status: a.status, answer: a.answer, agent: a.agent } } }
    ai = { accepted, log }
  }
  return { ...B.list(), ai }
}

const count = (list, k) => list.reduce((a, x) => { const v = typeof k === 'function' ? k(x) : x[k]; for (const y of [].concat(v)) a[y] = (a[y] || 0) + 1; return a }, {})

function summary({ findings, gaps }, mode) {
  return {
    mode,
    findings: { total: findings.length, byKind: count(findings, 'kind'), byMethod: count(findings, 'method'), byStatus: count(findings, 'status'), bySeverity: count(findings, f => f.severity?.level || 'none') },
    gaps: { total: gaps.length, open: gaps.filter(g => g.status === 'open').length, byKind: count(gaps, 'kind'), byStatus: count(gaps, 'status'), byResolver: count(gaps.filter(g => g.status === 'open'), 'resolvableBy'), byPriority: count(gaps.filter(g => g.status === 'open'), 'priority') },
  }
}

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const evl = f => f.evidence.slice(0, 2).map(e => `\`${e.file}:${e.line}\``).join(', ') || '–'
const ICON = { critical: '🔴', warning: '🟠', info: '⚪', good: '🟢' }
const KIND_TEXT = {
  risk: 'Risks found by fixed rules', 'agent-risk': 'Reviewed agent risks (curated file)', pattern: 'Coding patterns', 'ui-promise': 'UI promises vs server', authz: 'Authorization (static matrix)',
  'layer-violation': 'CDS layer violations', lint: 'Lint', 'state-transition': 'State transitions where UI and server disagree', 'action-without-handler': 'Actions without a handler',
  'native-sql': 'SQL strings', 'custom-route': 'Custom express routes', 'plugin-code': 'Plugin code', 'analysis-limit': 'Limits of this run', 'rule-hit': 'Library rules that fire',
  'handler-check': 'Handlers: parser vs running app', 'authz-measured': 'Authorization measured in CI', 'rule-reached': 'Handler rules no test runs', 'ai-finding': 'AI findings (passed the evidence gate)',
}
const RESOLVER = { measured: 'a request against the running app (CI)', ai: 'an AI pass reading the code', human: 'a person' }

function markdown({ findings, gaps }, S, meta) {
  const out = [
    `# Findings and gaps: ${meta.app || ''}`, '',
    `Mode **${S.mode}** · commit \`${String(meta.commit || '').slice(0, 7)}\` · ${S.findings.total} findings · ${S.gaps.open} open gaps of ${S.gaps.total}.`, '',
    'Machine-readable: [`findings.jsonl`](findings.jsonl) (schema `schema/finding.schema.json`) and [`gaps.jsonl`](gaps.jsonl) (schema `schema/gap.schema.json`), one JSON object per line. A finding is something the run decided, with evidence and method; a gap is a question it could not settle, with who can settle it. Docs: `docs/walkthrough/13-findings-and-gaps.md`.', '',
    '## How each finding was found', '',
    '| Kind | Total | static | measured | ai | human | suspected |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...Object.keys(S.findings.byKind).sort().map(k => { const l = findings.filter(f => f.kind === k); const m = x => l.filter(f => f.method === x).length || ''; return `| ${KIND_TEXT[k] || k} | ${l.length} | ${m('static')} | ${m('measured')} | ${m('ai')} | ${m('human')} | ${l.filter(f => f.status === 'suspected').length || ''} |` }),
    '', '## Open gaps, by who can settle them', '',
    '| Settled by | Open | high | medium | low |', '| --- | --- | --- | --- | --- |',
    ...['measured', 'ai', 'human'].map(r => { const l = gaps.filter(g => g.status === 'open' && g.resolvableBy.includes(r)); const p = x => l.filter(g => g.priority === x).length || ''; return `| ${RESOLVER[r]} | ${l.length} | ${p('high')} | ${p('medium')} | ${p('low')} |` }),
    '', `Settled: ${gaps.filter(g => g.status === 'resolved').length} resolved (measured or by a person), ${gaps.filter(g => g.status === 'answered').length} answered by AI (evidence checked, reasoning not reviewed).`, '',
    '## Gaps', '', '| Id | Priority | Status | Question | Settled by | Look at |', '| --- | --- | --- | --- | --- | --- |',
    ...gaps.slice(0, 200).map(g => `| \`${g.id}\` | ${g.priority} | ${g.status}${g.resolvedBy ? ` (${g.resolvedBy.length})` : ''} | ${cell(g.question)} | ${g.resolvableBy.join(', ')} | ${g.look.slice(0, 2).map(l => `\`${l.file}${l.line ? ':' + l.line : ''}\``).join(', ') || '–'} |`),
    ...(gaps.length > 200 ? ['', `_${gaps.length - 200} more in gaps.jsonl._`] : []), '',
  ]
  for (const k of Object.keys(S.findings.byKind).sort()) {
    const l = findings.filter(f => f.kind === k)
    out.push(`## ${KIND_TEXT[k] || k}`, '', '| | Id | Finding | Method · status | Evidence |', '| --- | --- | --- | --- | --- |')
    for (const f of l.slice(0, 80)) out.push(`| ${ICON[f.severity?.level] || ''} | \`${f.id}\` | **${cell(f.title)}**. ${cell(f.statement)} | ${f.method} · ${f.status}${f.gaps.length ? ` · ${f.gaps.length} gap${f.gaps.length > 1 ? 's' : ''}` : ''} | ${evl(f)} |`)
    if (l.length > 80) out.push('', `_${l.length - 80} more in findings.jsonl._`)
    out.push('')
  }
  return out.join('\n')
}

function prMd(S) {
  const r = S.gaps.byResolver
  return ['### Findings and gaps', '', `Mode **${S.mode}**: ${S.findings.total} findings (${Object.entries(S.findings.byMethod).map(([k, v]) => `${v} ${k}`).join(', ')}), ${S.findings.byStatus.suspected || 0} suspected. ` +
    `**${S.gaps.open} open gaps**: ${r.measured || 0} need a measurement, ${r.ai || 0} an AI pass, ${r.human || 0} a person.` +
    `${S.gaps.byStatus.resolved ? ` ${S.gaps.byStatus.resolved} resolved by measurement.` : ''}${S.gaps.byStatus.answered ? ` ${S.gaps.byStatus.answered} answered by AI.` : ''}`, ''].join('\n')
}

// writes the files; returns { summary, problems } (schema problems, also printed by the caller)
function write(result, { runDir, out, mode, meta }) {
  const dir = path.join(runDir, 'findings')
  fs.mkdirSync(dir, { recursive: true })
  const problems = [
    ...result.findings.flatMap((f, i) => check('finding', f, `findings.jsonl:${i + 1}`)),
    ...result.gaps.flatMap((g, i) => check('gap', g, `gaps.jsonl:${i + 1}`)),
  ]
  const S = summary(result, mode)
  fs.writeFileSync(path.join(dir, 'findings.jsonl'), result.findings.map(f => JSON.stringify(f)).join('\n') + '\n')
  fs.writeFileSync(path.join(dir, 'gaps.jsonl'), result.gaps.map(g => JSON.stringify(g)).join('\n') + '\n')
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(S, null, 1))
  fs.writeFileSync(path.join(dir, 'README.md'), markdown(result, S, meta))
  if (out) { fs.mkdirSync(path.join(out, 'pr'), { recursive: true }); fs.writeFileSync(path.join(out, 'pr', 'findings.md'), prMd(S)) }
  // mode static+ai: the gate's result; mode static leaves an earlier AI layer on disk, unused
  if (result.ai) {
    fs.writeFileSync(path.join(dir, 'ai.jsonl'), result.ai.accepted.map(f => JSON.stringify(f)).join('\n') + (result.ai.accepted.length ? '\n' : ''))
    fs.mkdirSync(path.join(runDir, 'ai'), { recursive: true })
    fs.writeFileSync(path.join(runDir, 'ai', 'merge-log.json'), JSON.stringify({ run: new Date().toISOString(), ...result.ai.log }, null, 1))
  }
  return { summary: S, problems }
}

module.exports = { build, write, summary, markdown, readJsonl }
