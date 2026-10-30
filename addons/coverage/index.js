// Addon "coverage": maps every equivalence class onto the tests that exercise it and adds the
// COV section (heatmap entity · operation × state) to the atlas. Off: "coverage": false in
// discovery.config.json. Remove: delete addons/coverage.
const fs = require('fs')
const path = require('path')
const { classesFrom, classify, summarize, LABEL, STATUS } = require('./coverage')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const ICON = { tested: '✅', gen: '🧪', spec: '🟡', likely: '〰️', fail: '❌', none: '⬜' }

// section, KPI and takeaway from D.COVERAGE
function apply(D) {
  const C = D.COVERAGE
  const take = `${C.tested} of ${C.total} classes tested (<b>${C.pct}%</b>)${C.ran ? ' by tests that ran in CI' : ''}; ${C.counts.spec} pin today's behaviour with the intended one waiting as a spec test, ${C.counts.gen} generated but not run yet, ${C.counts.likely} likely (approximate match), <b>${C.counts.none} untested</b>${C.counts.fail ? `, <b>${C.counts.fail} failing</b>` : ''}.`
  const sec = { code: 'COV', name: 'Coverage by class', take, views: [{ k: 'A', label: 'Heatmap' }, { k: 'B', label: 'Status per category' }, { k: 'C', label: 'Test next' }] }
  const i = D.SECTIONS.findIndex(s => s.code === 'COV')
  if (i >= 0) D.SECTIONS[i] = sec
  else { const t = D.SECTIONS.findIndex(s => s.code === 'TST'); D.SECTIONS.splice(t >= 0 ? t + 1 : D.SECTIONS.length, 0, sec) }
  D.KPIS = D.KPIS.filter(k => k[1] !== 'classes tested').concat([[`${C.pct}%`, 'classes tested', C.pct < 50 ? 'w' : '']])
  D.META.sources = { ...D.META.sources, COV: C.ran ? 'generated + test results' : 'generated' }
}

function facts(D, { g, td, root, runDir }) {
  const manifest = readJson(path.join(runDir, 'tests', 'generated', 'manifest.json'))
  const classes = classify(classesFrom(td, g, root), manifest)
  D.COVERAGE = { ...summarize(classes, D.RISKS, false), classes }
  apply(D)
}

// after CI ran the tests: re-classify with the Jest results, write pr/coverage.md for the PR comment
function afterTests({ out, results }) {
  const file = path.join(out, 'atlas-data.json')
  const D = readJson(file); if (!D?.COVERAGE) return false
  const manifest = readJson(path.join(out, 'run', 'tests', 'generated', 'manifest.json'))
  const classes = classify(D.COVERAGE.classes, manifest, results)
  D.COVERAGE = { ...summarize(classes, D.RISKS, !!results.generated), classes }
  apply(D)
  fs.writeFileSync(file, JSON.stringify(D, null, 1))
  fs.mkdirSync(path.join(out, 'pr'), { recursive: true })
  fs.writeFileSync(path.join(out, 'pr', 'coverage.md'), summaryMd(D.COVERAGE))
  return true
}

const cell = s => String(s ?? '').replace(/\|/g, '\\|')
function heatMd(C) {
  const byId = new Map(C.classes.map(c => [c.id, c]))
  const mark = ids => {
    if (!ids.length) return ''
    const cs = ids.map(i => byId.get(i)), t = cs.filter(c => c.st === 'tested').length
    const worst = STATUS.slice().reverse().find(s => cs.some(c => c.st === s))
    return `${t === cs.length ? ICON.tested : cs.some(c => c.st === 'fail') ? ICON.fail : ICON[worst === 'none' && t ? 'spec' : worst]} ${t}/${cs.length}`
  }
  return [`| Entity · operation | ${C.heat.cols.map(cell).join(' | ')} |`, `| --- | ${C.heat.cols.map(() => '---').join(' | ')} |`,
    ...C.heat.rows.map((r, i) => `| ${cell(r)} | ${C.heat.cells[i].map(mark).join(' | ')} |`)].join('\n')
}
function summaryMd(C) {
  return [`### Coverage by equivalence class`, '', `**${C.tested} of ${C.total} classes tested (${C.pct}%)**${C.ran ? ', from the test run in this job' : ', static (no test results)'}.`, '',
    `| Status | Classes |`, `| --- | --- |`, ...STATUS.map(s => `| ${ICON[s]} ${LABEL[s]} | ${C.counts[s]} |`), '',
    '<details><summary>Test next (top 5)</summary>', '', ...C.next.slice(0, 5).map(n => `- \`${n.id}\` ${n.name} (${n.cat})`), '', '</details>', ''].join('\n')
}

const topics = {
  COV: D => {
    const C = D.COVERAGE
    return [`${C.tested} of ${C.total} classes tested (${C.pct}%). ${C.ran ? 'Statuses include the results of the generated and existing tests from the CI run.' : 'No test results were given, so generated tests count as "generated, not run yet".'}`, '',
      'Legend: ' + STATUS.map(s => `${ICON[s]} ${LABEL[s]}`).join(' · ') + '. A cell shows tested / classes.', '',
      '### Heatmap: entity · operation × state', '', heatMd(C), '',
      '### Status per category', '', `| Category | ${STATUS.map(s => LABEL[s]).join(' | ')} |`, `| --- | ${STATUS.map(() => '---').join(' | ')} |`,
      ...C.cats.map(c => `| ${cell(c.n)} | ${STATUS.map(s => c[s]).join(' | ')} |`), '',
      '### Test next', '', '| # | Class | Category | Status | Priority |', '| --- | --- | --- | --- | --- |',
      ...C.next.map((n, i) => `| ${i + 1} | \`${cell(n.id)}\` ${cell(n.name)} | ${cell(n.cat)} | ${LABEL[n.st]} | ${n.score} |`), '',
      '### Every class', '', '| Class | Entity · op | State | Status | Tests | Existing requests | Name match |', '| --- | --- | --- | --- | --- | --- | --- |',
      ...C.classes.map(c => `| \`${cell(c.id)}\` | ${cell(c.entity)} · ${cell(c.op)} | ${cell(c.state ?? '')} | ${ICON[c.st]} ${LABEL[c.st]} | ${cell((c.tests || []).map(t => `${t.kind}: ${t.status}`).join(', '))} | ${c.request.map(r => '`' + r + '`').join(', ')} | ${cell(c.name_match || '')} |`)].join('\n')
  }
}

module.exports = { facts, afterTests, topics, views: path.join(__dirname, 'view.js'), summaryMd }
