// Product "Test strength": mutation testing (Stryker) says which code changes the tests notice. Runs in
// its own workflow (nightly), so most runs show "not run"; when a Stryker report is next to the run, L2 is
// Stryker's own HTML report (mutation-testing-elements, Apache-2.0) loaded from a CDN.
const path = require('path')
const svg = require('../svg')

const page = report => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mutation report</title></head><body>
<mutation-test-report-app titlePostfix="discovery"></mutation-test-report-app>
<script src="https://cdn.jsdelivr.net/npm/mutation-testing-elements@3.5.1/dist/mutation-test-elements.js"></script>
<script>document.querySelector('mutation-test-report-app').report = ${JSON.stringify(report).replace(/</g, '\\u003c')}</script></body></html>`

module.exports = {
  id: 'mutation', title: 'Test strength', step: 'Mutation testing', layer: 'tests',
  does: 'Which small code changes the tests notice (killed) and which go unnoticed (survived), per file and per business class.',
  from: ['mutation-summary.json', 'mutation.json (Stryker report)'],
  build(C) {
    const M = C.facts().MUTATION || C.json(C.P('mutation-summary.json'))
    const report = C.json(C.P('mutation.json')) || C.json(path.join(C.out, '..', 'mutation.json'))
    if (!M) return { status: 'not-run', why: 'mutation testing runs in its own nightly workflow (mutation.yml); no report next to this run', kpis: [{ label: 'score', value: 'nightly' }] }
    const lists = {
      files: { title: 'Score per file', noun: 'files', what: 'Share of mutants the tests killed in each file, weakest first.', columns: [{ key: 'file', label: 'File' }, { key: 'score', label: 'Score %', num: true }, { key: 'killed', label: 'Killed', num: true }, { key: 'mutants', label: 'Mutants', num: true }],
        rows: (M.files || []).map(f => { const sc = f.mutants ? Math.round(100 * f.killed / f.mutants) : 0; return { file: f.file, score: sc, killed: f.killed, mutants: f.mutants, _c: sc < 60 ? svg.TONE.bad : svg.TONE.ok, _n: `${f.killed}/${f.mutants} killed` } }),
        sort: { key: 'score', dir: 'asc' }, chart: { kind: 'bars', label: 'file', value: 'score', max: 100, unit: '%', title: 'Mutation score per file' } },
      classes: { title: 'Score per class', noun: 'classes', columns: [{ key: 'cls', label: 'Class' }, { key: 'covered', label: 'Covered', num: true }, { key: 'killed', label: 'Killed', num: true }, { key: 'score', label: 'Score %', num: true }], rows: (M.classes || []).map(c => ({ cls: c.cls, covered: c.covered, killed: c.killed, score: c.score })), sort: { key: 'score', dir: 'asc' } },
      survivors: { title: 'Survivors', noun: 'survivors', what: 'Code changes no test noticed.', columns: [{ key: 'file', label: 'File', facet: true }, { key: 'line', label: 'Line', num: true }, { key: 'mutator', label: 'Mutator', facet: true }, { key: 'replacement', label: 'Replacement' }], rows: (M.survivors || []).map(x => ({ file: x.file, line: x.line, mutator: x.mutator, replacement: x.replacement })), sort: { key: 'file', dir: 'asc' } },
    }
    const md = [
      `**Mutation score ${M.score}%** (${M.killed} of ${M.valid} mutants killed), ${M.survivors?.length || 0} survivors.${report ? ' [Open the Stryker report](report.html).' : ''}`, '',
      '### Per file', '', '{{list:files}}', '### Per class', '', '{{list:classes}}', '### Survivors', '', '{{list:survivors}}',
    ].join('\n')
    return { status: M.score >= 60 ? 'ok' : 'warn', kpis: [{ label: 'score', value: `${M.score}%` }, { label: 'mutants', value: M.valid }, { label: 'survivors', value: M.survivors?.length || 0, tone: 'warn' }], md, lists, data: { 'mutation-summary.json': M }, pages: report ? { 'report.html': page(report) } : {} }
  },
}
