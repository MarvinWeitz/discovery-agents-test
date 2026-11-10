// Product "Coverage": which business cases (equivalence classes) are tested, and after a CI run which
// handler rules any test executed (line coverage from Jest / V8, istanbul JSON format).
const svg = require('../svg')

const KEYS = [{ key: 'tested', label: 'tested', color: '#2f8a3a' }, { key: 'gen', label: 'generated, not run', color: '#7fb77e' }, { key: 'spec', label: 'spec only', color: '#3f7fbf' }, { key: 'likely', label: 'likely (by name)', color: '#c9b458' }, { key: 'fail', label: 'test fails', color: '#c2414b' }, { key: 'none', label: 'untested', color: '#c7ccd1' }]

module.exports = {
  id: 'coverage', title: 'Coverage by class', step: 'Coverage', layer: 'tests',
  does: 'Which business cases are tested (per equivalence class), and which handler rules a test executed in CI.',
  from: ['atlas-data.json COVERAGE', 'atlas-data.json MEASURED.rules (CI)'],
  build(C) {
    const D = C.facts(), K = D.COVERAGE, rules = D.MEASURED?.rules
    if (!K) return { status: 'empty', why: 'coverage addon is off' }
    const view = svg.stacked((K.cats || []).map(c => ({ label: c.n, parts: KEYS.map(k => ({ key: k.key, value: c[k.key] || 0 })) })), KEYS, { title: 'Classes per category by test status' })
    const md = [
      `**${K.tested} of ${K.total} classes tested (${K.pct}%)**${K.ran ? '' : ' (tests not run in this run: generated ones count as "generated, not run")'}.${rules ? ` Handler rules reached by any test: **${rules.reached} of ${rules.measured}**.` : ''}`, '',
      '### Classes per category', '', '{{view:classes.svg}}',
      '### Test next', '', '{{list:next}}',
      rules?.never?.length ? '### Rules no test reaches\n\n{{list:never}}' : '',
    ].join('\n')
    return {
      status: K.pct >= 60 ? 'ok' : 'warn',
      kpis: [{ label: 'classes tested', value: `${K.pct}%`, tone: K.pct < 60 ? 'warn' : 'ok' }, { label: 'untested', value: K.counts?.none ?? 0 }, { label: 'failing', value: K.counts?.fail ?? 0, tone: K.counts?.fail ? 'bad' : undefined }, { label: 'rules reached', value: rules ? `${rules.reached}/${rules.measured}` : 'in CI' }],
      md, views: { 'classes.svg': view }, lists: {
        next: { title: 'Test next', noun: 'classes', what: 'Untested business cases, highest score (risk × value) first.', columns: [{ key: 'name', label: 'Class' }, { key: 'cat', label: 'Category', facet: true }, { key: 'st', label: 'Status', facet: true }, { key: 'score', label: 'Score', num: true }], rows: (K.next || []).map(n => ({ name: n.name, cat: n.cat, st: n.st, score: n.score })), sort: { key: 'score', dir: 'desc' } },
        ...(rules?.never?.length ? { never: { title: 'Rules no test reaches', noun: 'rules', what: 'Handler rules no test executed in the CI run.', columns: [{ key: 'id', label: 'Rule' }, { key: 'kind', label: 'Kind', facet: true }, { key: 'guard', label: 'Guard' }, { key: 'where', label: 'Where' }], rows: rules.never.map(r => ({ id: r.id, kind: r.kind, guard: r.guard, where: r.ev })), sort: { key: 'kind', dir: 'asc' } } } : {}),
      }, data: { 'coverage.json': { classes: K, rules: rules || null } },
    }
  },
}
