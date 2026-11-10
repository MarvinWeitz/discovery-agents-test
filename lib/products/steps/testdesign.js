// Product "Classification tree": the equivalence classes the test design derived, per category and
// dimension, and the pairwise rows chosen to cover combinations (Classification Tree Method idea).
const svg = require('../svg')
const { table } = require('../md')

module.exports = {
  id: 'testdesign', title: 'Classification tree', step: 'Test design', layer: 'tests',
  does: 'Equivalence classes per category (authorization, UI promises, status transitions, handler rules, …) and the pairwise rows that cover the combinations.',
  from: ['atlas-data.json TESTCATS, CLASSES, DD', 'run/tests/class-seeds.json'],
  build(C) {
    const D = C.facts(), cats = D.TESTCATS || [], cls = D.CLASSES || []
    if (!cls.length) return { status: 'empty', why: 'no equivalence classes' }
    // tree: category -> technique -> sample classes
    const lv = [[], [], []]
    for (const c of cats) {
      lv[0].push({ id: `c:${c.n}`, label: `${c.n} (${c.cls})`, color: '#2f8a3a' })
      lv[1].push({ id: `k:${c.n}`, label: c.k, parent: `c:${c.n}`, color: '#3f7fbf', title: c.why })
      const mine = cls.filter(x => x[0] === c.n)
      for (const x of mine.slice(0, 3)) lv[2].push({ id: `x:${x[1]}`, label: x[2], parent: `k:${c.n}`, color: '#5b6875', title: `${x[2]} → ${x[4]}` })
      if (mine.length > 3) lv[2].push({ id: `more:${c.n}`, label: `… ${mine.length - 3} more`, parent: `k:${c.n}`, color: '#8c959f' })
    }
    const dd = D.DD
    const md = [
      `${cls.length} equivalence classes in ${cats.length} categories; ${cats.reduce((a, c) => a + (c.cov || 0), 0)} covered by a test today.`, '',
      '![classification tree](views/tree.svg)', '',
      table(['Category', 'Technique', 'Classes', 'Covered today', 'Why'], cats.map(c => [c.n, c.k, c.cls, c.cov, c.why])),
      dd ? `### Pairwise: ${dd.action}\n\n${dd.factors.length} factors, ${dd.full} full combinations, **${dd.rows.length} pairwise rows** cover every pair.\n\n` + table(dd.factors.map(f => f[0]), dd.rows.map(r => r.map((v, i) => dd.factors[i][1][v])), { max: 25 }) : '',
      '### All classes', '', '{{list:classes}}',
    ].join('\n')
    return {
      status: 'ok',
      kpis: [{ label: 'classes', value: cls.length }, { label: 'categories', value: cats.length }, { label: 'covered today', value: cats.reduce((a, c) => a + (c.cov || 0), 0) }, { label: 'pairwise rows', value: dd?.rows?.length || 0 }],
      lists: { classes: { title: 'Equivalence classes', noun: 'classes', what: 'Every equivalence class with its input, the expected outcome and how it is tested today.', columns: [{ key: 'category', label: 'Category', facet: true }, { key: 'name', label: 'Class' }, { key: 'input', label: 'Input' }, { key: 'expected', label: 'Expected' }, { key: 'today', label: 'Today', facet: true }], rows: cls.map(x => ({ category: x[0], name: x[2], input: x[3], expected: x[4], today: x[5] || '' })), sort: { key: 'category', dir: 'asc' } } },
      md, views: { 'tree.svg': svg.columns(lv, { title: 'Category → technique → classes', colW: 300 }) },
      data: { 'classes.json': cls.map(x => ({ category: x[0], id: x[1], name: x[2], input: x[3], expected: x[4], today: x[5] })), 'class-seeds.json': C.classSeeds() },
    }
  },
}
