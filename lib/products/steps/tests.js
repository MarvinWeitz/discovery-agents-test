// Product "Test results": the generated tests as written, and after a CI run their results in CTRF
// (Common Test Report Format, MIT; one JSON shape every CI and dashboard can read), plus the requests
// the tests sent as recorded by the measured addon.
const svg = require('../svg')
const { table } = require('../md')

const ST = { passed: 'passed', failed: 'failed', pending: 'skipped', skipped: 'skipped', todo: 'pending', disabled: 'skipped' }

function ctrf(jest) {
  const tests = (jest.testResults || []).flatMap(f => (f.assertionResults || []).map(a => ({ name: a.fullName || a.title, status: ST[a.status] || 'other', duration: a.duration || 0, suite: (a.ancestorTitles || []).join(' > '), filePath: f.name, message: (a.failureMessages || [])[0]?.slice(0, 500) })))
  const n = s => tests.filter(t => t.status === s).length
  return { reportFormat: 'CTRF', specVersion: '0.0.0', results: { tool: { name: 'jest' }, summary: { tests: tests.length, passed: n('passed'), failed: n('failed'), skipped: n('skipped'), pending: n('pending'), other: n('other'), start: jest.startTime || 0, stop: (jest.startTime || 0) + tests.reduce((a, t) => a + t.duration, 0) }, tests } }
}

module.exports = {
  id: 'tests', title: 'Test results', step: 'Generated tests and test run', layer: 'tests',
  does: 'The generated tests, and after a CI run their results (CTRF) and the requests they sent.',
  from: ['run/tests/generated/manifest.json', 'jest-generated.json (CI)', 'atlas-data.json MEASURED.requests (CI)'],
  build(C) {
    const man = C.generatedManifest(), jest = C.jest(), req = C.facts().MEASURED?.requests
    const gen = man ? (Array.isArray(man) ? man : man.tests || Object.entries(man).map(([title, v]) => ({ title, ...(typeof v === 'object' ? v : { cls: v }) }))) : []
    if (!jest) {
      return {
        status: 'not-run', why: 'tests are generated here and run in CI (the app must be installed)',
        kpis: [{ label: 'tests generated', value: gen.length }, { label: 'run', value: 'in CI' }],
        md: `${gen.length} tests generated, not run in this run: CI installs the app and runs them, then this card shows results.\n\n` + table(['Test', 'Class'], gen.map(t => [t.title || t.name || '', t.cls || t.class || t.classId || '']), { max: 25 }),
        data: { 'generated.json': gen },
      }
    }
    const R = ctrf(jest), S = R.results.summary
    const bySuite = {}
    for (const t of R.results.tests) { const k = t.filePath.split('/').pop(); const x = bySuite[k] ||= { passed: 0, failed: 0, skipped: 0 }; x[t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped']++ }
    const keys = [{ key: 'passed', label: 'passed', color: '#2f8a3a' }, { key: 'failed', label: 'failed', color: '#c2414b' }, { key: 'skipped', label: 'skipped (spec tests)', color: '#8c959f' }]
    const view = svg.stacked(Object.entries(bySuite).map(([k, v]) => ({ label: k, parts: keys.map(x => ({ key: x.key, value: v[x.key] })) })), keys, { title: 'Results per test file' })
    const md = [
      `**${S.passed} passed**, ${S.failed} failed, ${S.skipped} skipped of ${S.tests} tests. Report in CTRF: [results.ctrf.json](data/results.ctrf.json).`, '',
      '![results](views/results.svg)', '',
      S.failed ? '### Failed\n\n' + table(['Test', 'Message'], R.results.tests.filter(t => t.status === 'failed').map(t => [t.name, (t.message || '').split('\n')[0]])) : '',
      req ? `### Requests the tests sent\n\n${req.total} requests from ${req.files} test files as ${req.users.length} users.\n\n` + table(['Entity', 'Event', 'Count', 'Users', 'Outcomes'], req.rows.map(r => [r.entity || '', r.event, r.n, r.users.join(', '), Object.entries(r.outcomes).map(([k, v]) => `${k}×${v}`).join(' ')]), { max: 20 }) : '',
      '### All tests', '', table(['Test', 'Status', 'ms'], R.results.tests.map(t => [t.name, t.status, t.duration]), { max: 40 }),
    ].join('\n')
    return {
      status: S.failed ? 'bad' : 'ok',
      kpis: [{ label: 'passed', value: S.passed, tone: 'ok' }, { label: 'failed', value: S.failed, tone: S.failed ? 'bad' : undefined }, { label: 'skipped', value: S.skipped }, { label: 'requests recorded', value: req?.total || 0 }],
      md, views: { 'results.svg': view }, data: { 'results.ctrf.json': R, 'generated.json': gen },
    }
  },
}
