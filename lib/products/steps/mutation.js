// Product "Test strength": mutation testing (Stryker) says which code changes the tests notice. Runs in
// its own workflow (nightly), so most runs show "not run"; when a Stryker report is next to the run, L2 is
// Stryker's own HTML report (mutation-testing-elements, Apache-2.0) loaded from a CDN.
const path = require('path')
const svg = require('../svg')
const { table } = require('../md')

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
    const files = svg.bars((M.files || []).map(f => ({ label: f.file, value: f.mutants ? Math.round(100 * f.killed / f.mutants) : 0, note: `${f.killed}/${f.mutants} killed`, tone: f.mutants && f.killed / f.mutants < .6 ? 'bad' : 'ok' })), { title: 'Mutation score per file', max: 100, unit: '%' })
    const md = [
      `**Mutation score ${M.score}%** (${M.killed} of ${M.valid} mutants killed), ${M.survivors?.length || 0} survivors.${report ? ' [Open the Stryker report](report.html).' : ''}`, '',
      '![score per file](views/files.svg)', '',
      table(['Class', 'Covered', 'Killed', 'Score'], (M.classes || []).map(c => [c.cls, c.covered, c.killed, c.score + '%']), { max: 15 }),
      '### Survivors', '', table(['File', 'Line', 'Mutator', 'Replacement'], (M.survivors || []).map(s => [s.file, s.line, s.mutator, s.replacement]), { max: 15 }),
    ].join('\n')
    return { status: M.score >= 60 ? 'ok' : 'warn', kpis: [{ label: 'score', value: `${M.score}%` }, { label: 'mutants', value: M.valid }, { label: 'survivors', value: M.survivors?.length || 0, tone: 'warn' }], md, views: { 'files.svg': files }, data: { 'mutation-summary.json': M }, pages: report ? { 'report.html': page(report) } : {} }
  },
}
