// Product "Evidence ledger": every claim of the run with how it was found (static, measured, AI, human),
// its status and evidence, and every open question (gap) with who can answer it.
const svg = require('../svg')
const { table } = require('../md')

const METHOD = [{ key: 'measured', label: 'measured', color: '#2f8a3a' }, { key: 'static', label: 'static', color: '#3f7fbf' }, { key: 'human', label: 'human', color: '#8a4fc4' }, { key: 'ai', label: 'AI', color: '#c27c0e' }]

module.exports = {
  id: 'findings', title: 'Evidence ledger', step: 'Findings and gaps', layer: 'run',
  does: 'Every claim with how it was found (static, measured, AI, human), its status and evidence, and every open question with who can answer it.',
  from: ['run/findings/findings.jsonl', 'run/findings/gaps.jsonl'],
  build(C) {
    const F = C.findings(), Gp = C.gaps()
    if (!F.length && !Gp.length) return { status: 'empty', why: 'findings stage did not run' }
    const kinds = [...new Set(F.map(f => f.kind))]
    const rows = kinds.map(k => ({ label: k, parts: METHOD.map(m => ({ key: m.key, value: F.filter(f => f.kind === k && f.method === m.key).length })) })).sort((a, b) => b.parts.reduce((s, p) => s + p.value, 0) - a.parts.reduce((s, p) => s + p.value, 0))
    const ladder = svg.stacked(rows, METHOD, { title: 'Findings per kind, by how they were found' })
    const layers = [...new Set(F.map(f => f.layer || 'other'))], sevs = ['critical', 'warning', 'info']
    const sl = svg.matrix(sevs, layers, (i, j) => { const n = F.filter(f => (f.severity?.level) === sevs[i] && (f.layer || 'other') === layers[j]).length; return n ? { text: String(n), color: ['#c2414b', '#c27c0e', '#3f7fbf'][i], title: `${n} ${sevs[i]} in ${layers[j]}` } : null }, { title: 'Severity × layer', cw: 72 })
    const open = Gp.filter(g => g.status === 'open')
    const resolvers = ['measured', 'ai', 'human']
    const board = resolvers.map(r => [r, open.filter(g => (g.resolvableBy || [])[0] === r)])
    const md = [
      `${F.length} findings (${METHOD.map(m => `${F.filter(f => f.method === m.key).length} ${m.label}`).join(', ')}) · ${Gp.length} questions, **${open.length} open**.`, '',
      '![confidence ladder](views/ladder.svg)', '', '![severity by layer](views/severity.svg)', '',
      '### Open questions by who can answer them', '',
      ...board.map(([r, gs]) => `**${r}** (${gs.length}): ${gs.slice(0, 6).map(g => g.question.split('?')[0].slice(0, 90) + '?').join(' · ') || 'none'}${gs.length > 6 ? ` · … ${gs.length - 6} more` : ''}\n`),
      table(['Gap', 'Kind', 'Priority', 'Status', 'Can answer'], Gp.map(g => [g.id, g.kind, g.priority || '', g.status, (g.resolvableBy || []).join(', ')]), { max: 15 }),
      'Full data: [findings.jsonl](data/findings.jsonl), [gaps.jsonl](data/gaps.jsonl) (JSON Schemas in `schema/`).',
    ].join('\n')
    return {
      status: open.length ? 'warn' : 'ok',
      kpis: [{ label: 'findings', value: F.length }, { label: 'measured', value: F.filter(f => f.method === 'measured').length, tone: 'ok' }, { label: 'AI (gated)', value: F.filter(f => f.method === 'ai').length }, { label: 'open questions', value: open.length, tone: open.length ? 'warn' : undefined }],
      md, views: { 'ladder.svg': ladder, 'severity.svg': sl }, data: { 'findings.jsonl': F.map(f => JSON.stringify(f)).join('\n') + '\n', 'gaps.jsonl': Gp.map(g => JSON.stringify(g)).join('\n') + '\n' },
    }
  },
}
