// Addon "mutation": Stryker mutates the app's handler code and reruns the generated and existing
// tests; the share of mutants a test catches is the quality score. Runs nightly in
// .github/workflows/mutation.yml (slow), so it has no pipeline hook: cli.js adds the MUT section
// to an existing atlas. Off: "mutation": false. Remove: delete addons/mutation and the workflow.
const path = require('path')

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const code = s => s ? '`' + String(s).replace(/`/g, "'") + '`' : ''

function apply(D) {
  const M = D.MUTATION
  const take = `Stryker injected ${M.total} small bugs into the handler code; the tests caught <b>${M.score}%</b> of them${M.scoreCovered !== null ? ` (${M.scoreCovered}% of those a test reaches)` : ''}. <b>${M.survivors.length} survived</b>: each is a change no test notices, so a test target.`
  const sec = { code: 'MUT', name: 'Mutation score', take, views: [{ k: 'A', label: 'Survivors' }, { k: 'B', label: 'Score per class' }] }
  const i = D.SECTIONS.findIndex(s => s.code === 'MUT')
  if (i >= 0) D.SECTIONS[i] = sec
  else { const t = D.SECTIONS.findIndex(s => s.code === 'COV' || s.code === 'TST'); D.SECTIONS.splice(t >= 0 ? t + 1 : D.SECTIONS.length, 0, sec) }
  D.KPIS = D.KPIS.filter(k => k[1] !== 'mutation score').concat([[`${M.score}%`, 'mutation score', M.score < 60 ? 'c' : M.score < 80 ? 'w' : '']])
  D.META.sources = { ...D.META.sources, MUT: 'Stryker run' }
}

function summaryMd(M) {
  return [`### Mutation score: ${M.score}%`, '', `${M.killed} of ${M.valid} mutants killed${M.scoreCovered !== null ? `; ${M.scoreCovered}% of the mutants a test reaches` : ''}. Status: ${Object.entries(M.byStatus).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '',
    `| File | Mutants | Killed | Score |`, '| --- | --- | --- | --- |', ...M.files.map(f => `| ${code(f.file)} | ${f.mutants} | ${f.killed} | ${f.mutants ? Math.round(f.killed / f.mutants * 100) : '–'}% |`), '',
    `<details><summary>${M.survivors.length} survivors (bugs no test catches)</summary>`, '', '| Where | Mutation | Rule / handler | Status |', '| --- | --- | --- | --- |',
    ...M.survivors.slice(0, 40).map(s => `| ${code(`${s.file}:${s.line}`)} | ${cell(s.says)} | ${cell(s.factLabel || '')} | ${s.status === 'NoCoverage' ? 'no test reaches it' : 'survived'} |`), '', '</details>', ''].join('\n')
}

const topics = {
  MUT: D => {
    const M = D.MUTATION
    return [summaryMd(M).split('\n').slice(2).join('\n'), '', '### Score per equivalence class', '', 'Mutants reached by the generated tests of the class, and how many of them a test of the class killed.', '',
      '| Class | Mutants reached | Killed | Score |', '| --- | --- | --- | --- |', ...M.classes.map(c => `| ${code(c.cls)} | ${c.covered} | ${c.killed} | ${c.score}% |`), '',
      '### Every survivor', '', '| Where | Mutation | Rule / handler | Covered by |', '| --- | --- | --- | --- |',
      ...M.survivors.map(s => `| ${code(`${s.file}:${s.line}`)} | ${cell(s.says)} | ${cell(s.factLabel || '')} | ${cell(s.coveredBy.slice(0, 2).join('; ') || 'no test')} |`)].join('\n')
  }
}

module.exports = { apply, summaryMd, topics, views: path.join(__dirname, 'view.js') }
