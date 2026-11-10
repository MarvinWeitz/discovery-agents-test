// Product "Test results": the generated tests as written, and after a CI run their results in CTRF
// (Common Test Report Format, MIT; one JSON shape every CI and dashboard can read), plus the requests
// the tests sent as recorded by the measured addon.

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
        md: `${gen.length} tests generated, not run in this run: CI installs the app and runs them, then this card shows results.\n\n{{list:generated}}`,
        lists: { generated: { title: 'Generated tests', noun: 'tests', columns: [{ key: 'title', label: 'Test' }, { key: 'cls', label: 'Class' }], rows: gen.map(t => ({ title: t.title || t.name || '', cls: t.cls || t.class || t.classId || '' })), sort: { key: 'title', dir: 'asc' } } },
        data: { 'generated.json': gen },
      }
    }
    const R = ctrf(jest), S = R.results.summary
    const bySuite = {}
    for (const t of R.results.tests) { const k = t.filePath.split('/').pop(); const x = bySuite[k] ||= { passed: 0, failed: 0, skipped: 0 }; x[t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped']++ }
    const keys = [{ key: 'passed', label: 'passed', color: '#2f8a3a' }, { key: 'failed', label: 'failed', color: '#c2414b' }, { key: 'skipped', label: 'skipped (spec tests)', color: '#8c959f' }]
    const RANK = { failed: 3, other: 2, skipped: 1, pending: 1, passed: 0 }
    const lists = {
      files: { title: 'Results per test file', noun: 'test files', columns: [{ key: 'file', label: 'Test file' }, ...keys.map(k => ({ key: k.key, label: k.label, num: true }))], rows: Object.entries(bySuite).map(([file, v]) => ({ file, ...v })), sort: { key: 'failed', dir: 'desc' }, chart: { kind: 'stacked', label: 'file', keys, title: 'Results per test file' } },
      tests: { title: 'All tests', noun: 'tests', what: 'Every test with its result, failures first.', columns: [{ key: 'name', label: 'Test' }, { key: 'status', label: 'Status', facet: true }, { key: 'file', label: 'File', facet: true }, { key: 'ms', label: 'ms', num: true }, { key: 'message', label: 'Message' }, { key: 'rank', label: 'Failures first', num: true, hide: true }],
        rows: R.results.tests.map(t => ({ name: t.name, status: t.status, file: t.filePath.split('/').pop(), ms: t.duration, message: (t.message || '').split('\n')[0], rank: RANK[t.status] ?? 2 })), sort: { key: 'rank', dir: 'desc' } },
      ...(req ? { requests: { title: 'Requests the tests sent', noun: 'entity × event pairs', columns: [{ key: 'entity', label: 'Entity', facet: true }, { key: 'event', label: 'Event', facet: true }, { key: 'n', label: 'Count', num: true }, { key: 'users', label: 'Users', facet: true }, { key: 'outcomes', label: 'Outcomes' }], rows: req.rows.map(r => ({ entity: r.entity || '', event: r.event, n: r.n, users: r.users, outcomes: Object.entries(r.outcomes).map(([k, v]) => `${k}×${v}`).join(' ') })), sort: { key: 'n', dir: 'desc' } } } : {}),
    }
    const md = [
      `**${S.passed} passed**, ${S.failed} failed, ${S.skipped} skipped of ${S.tests} tests. Report in CTRF: [results.ctrf.json](data/results.ctrf.json).`, '',
      '### Per test file', '', '{{list:files}}',
      req ? `### Requests the tests sent\n\n${req.total} requests from ${req.files} test files as ${req.users.length} users.\n\n{{list:requests}}` : '',
      '### All tests', '', '{{list:tests}}',
    ].join('\n')
    return {
      status: S.failed ? 'bad' : 'ok',
      kpis: [{ label: 'passed', value: S.passed, tone: 'ok' }, { label: 'failed', value: S.failed, tone: S.failed ? 'bad' : undefined }, { label: 'skipped', value: S.skipped }, { label: 'requests recorded', value: req?.total || 0 }],
      md, lists, data: { 'results.ctrf.json': R, 'generated.json': gen },
    }
  },
}
