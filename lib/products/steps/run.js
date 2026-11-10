// Product "Run timeline": which stages ran, how long, what each said, from <out>/manifest.json.
const svg = require('../svg')

module.exports = {
  id: 'run', title: 'Run timeline', step: 'The run itself', layer: 'run',
  does: 'Which stages ran, in which mode, how long each took and what it reported.',
  from: ['manifest.json'],
  build(C) {
    const M = C.manifest()
    if (!M) return { status: 'empty', why: 'no manifest.json in this run' }
    const t0 = Math.min(...M.stages.filter(s => s.started).map(s => Date.parse(s.started)))
    const rows = M.stages.map(s => ({
      label: s.id, start: s.started ? (Date.parse(s.started) - t0) / 1000 : 0, seconds: s.status === 'ran' || s.status === 'failed' ? s.seconds ?? 0 : null,
      tone: s.status === 'failed' ? 'bad' : s.method === 'measured' ? 'ok' : s.method === 'ai' ? 'warn' : 'info', note: s.status !== 'ran' ? `${s.status}${s.why ? ': ' + s.why : ''}` : s.method,
    }))
    const total = M.stages.reduce((a, s) => a + (s.seconds || 0), 0)
    const failed = M.stages.filter(s => s.status === 'failed').length
    const md = [
      `Mode **${M.mode}** · toolkit ${M.toolkit?.version || ''} ${M.toolkit?.commit ? '@ ' + M.toolkit.commit.slice(0, 7) : ''} · CAP ${M.toolkit?.cds || '?'} · app ${M.app?.name || ''} ${M.app?.commit ? '@ ' + M.app.commit.slice(0, 7) : ''}`, '',
      '### Timeline', '', '{{view:timeline.svg}}',
      '### Stages', '', '{{list:stages}}',
      'Blue: static · green: measured (the running app answered) · amber: AI · red: failed.',
    ].join('\n')
    return {
      status: failed ? 'warn' : 'ok',
      kpis: [{ label: 'stages ran', value: M.stages.filter(s => s.status === 'ran').length }, { label: 'failed', value: failed, tone: failed ? 'bad' : undefined }, { label: 'seconds', value: Math.round(total) }, { label: 'mode', value: M.mode }],
      md, views: { 'timeline.svg': svg.gantt(rows, { title: 'Stage timeline' }) }, lists: { stages: { title: 'Stages', noun: 'stages', inline: 60, columns: [{ key: 'id', label: 'Stage' }, { key: 'status', label: 'Status', facet: true }, { key: 'method', label: 'Method', facet: true }, { key: 'seconds', label: 'Seconds', num: true }, { key: 'said', label: 'Said' }, { key: 'order', label: 'Order', num: true, hide: true }], rows: M.stages.map((s, i) => ({ id: s.id, status: s.status, method: s.method || '', seconds: s.seconds ?? '', said: s.said || s.why || '', order: i })), sort: { key: 'order', dir: 'asc' } } }, data: { 'stages.json': M.stages },
    }
  },
}
