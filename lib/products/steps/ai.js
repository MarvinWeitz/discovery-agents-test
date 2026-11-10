// Product "AI ledger": what the AI was asked, what it answered, and what the evidence gate accepted or
// rejected and why (run/ai/). In mode static there is nothing to show, and the card says so.
const path = require('path')
const svg = require('../svg')

module.exports = {
  id: 'ai', title: 'AI ledger', step: 'AI gap pass', layer: 'run',
  does: 'Questions handed to an AI, its answers, and what the evidence gate accepted or rejected, with the reason.',
  from: ['run/ai/requests/index.json', 'run/ai/merge-log.json'],
  build(C) {
    const idx = C.json(path.join(C.run, 'ai', 'requests', 'index.json')), log = C.json(path.join(C.run, 'ai', 'merge-log.json'))
    const gaps = C.gaps()
    const aiGaps = gaps.filter(g => (g.resolvableBy || []).includes('ai'))
    if (!idx && !log) return { status: 'not-run', why: `mode ${C.manifest()?.mode || 'static'}: no AI requests in this run (${aiGaps.length} open questions an AI could answer; run with --mode static+ai)`, kpis: [{ label: 'AI could answer', value: aiGaps.length }] }
    const reqs = Array.isArray(idx) ? idx : idx?.requests || []
    // merge-log.json: { answers: [{ gap, status (answer status), answer, accepted (count), rejected: [{ title, why }] }] }
    const answers = log?.answers || []
    const acc = answers.reduce((n, a) => n + (+a.accepted || 0), 0), rej = answers.reduce((n, a) => n + (a.rejected?.length || 0), 0)
    const answered = answers.length
    const funnel = svg.bars([{ label: 'open questions for AI', value: aiGaps.length || reqs.length, tone: 'none' }, { label: 'requests written', value: reqs.length, tone: 'info' }, { label: 'answers', value: answered, tone: 'info' }, { label: 'findings accepted by the gate', value: acc, tone: 'ok' }, { label: 'rejected by the gate', value: rej, tone: 'bad' }], { title: 'Gate funnel' })
    const md = [
      `${reqs.length} requests · ${answered} answered · ${acc} findings accepted, ${rej} rejected by the evidence gate. Accepted AI findings stay "suspected" until a test or a person confirms them.`, '',
      '### Gate funnel', '', '{{view:funnel.svg}}',
      '### Answers', '', '{{list:answers}}',
    ].join('\n')
    return { status: 'ok', kpis: [{ label: 'requests', value: reqs.length }, { label: 'answered', value: answered }, { label: 'accepted', value: acc, tone: 'ok' }, { label: 'rejected', value: rej, tone: rej ? 'warn' : undefined }], md, views: { 'funnel.svg': funnel }, lists: { answers: { title: 'Answers', noun: 'answers', what: 'Every AI answer, what the evidence gate accepted and what it rejected and why.',
      columns: [{ key: 'gap', label: 'Gap' }, { key: 'status', label: 'Answer status', facet: true }, { key: 'answer', label: 'Answer' }, { key: 'accepted', label: 'Accepted', num: true }, { key: 'rejected', label: 'Rejected', num: true }, { key: 'why', label: 'Rejected because' }],
      rows: answers.map(a => ({ gap: a.gap, status: a.status || '', answer: `${String(a.answer || '').slice(0, 140)}${String(a.answer || '').length > 140 ? '…' : ''}`, accepted: +a.accepted || 0, rejected: (a.rejected || []).length, why: (a.rejected || []).map(r => r.why).join('; ') })), sort: { key: 'rejected', dir: 'desc' } } }, data: { 'merge-log.json': log || [], 'requests.json': reqs } }
  },
}
