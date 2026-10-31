// Atlas section TST · Test design: categories, coverage, all-pairs. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { pairwise } = require('../../analyse/test-design')
const { uniq } = require('../util')

function tst(g, td) {
  const TESTCATS = td.categories.map(c => ({ n: c.n, k: c.k, cls: c.cls, cov: c.cov, why: c.why }))
  const CLASSES = td.categories.flatMap(c => c.classes.map(x => [c.n, x.id, x.name, typeof x.input === 'object' ? Object.entries(x.input).map(([k, v]) => `${k}=${v}`).join(', ') : x.input, x.expected, x.today || '', x.covered_by || '', x.req ? 'yes' : '']))
  let DD = null
  if (td.DD) {
    const rows = pairwise(td.DD.factors)
    DD = { action: td.DD.action, factors: td.DD.factors, invalid: td.DD.invalid, boundary: td.DD.boundary, rules: td.DD.rules, fallback: td.DD.fallback, full: td.DD.full, rows }
  }
  const tests = g.byType('ExistingTest'), svc = tests.filter(t => t.props.kind === 'service'), opa = tests.filter(t => t.props.kind === 'ui-opa5')
  const users = uniq(svc.flatMap(t => t.props.runsAs))
  const TEST_NOTE = `Existing suite: ${svc.reduce((a, t) => a + t.props.cases, 0)} service tests in ${svc.length} files (users: ${users.join(', ') || 'none set'}), ${opa.reduce((a, t) => a + t.props.cases, 0)} OPA5 steps in ${opa.length} journeys.`
  return { TESTCATS, CLASSES, DD, TEST_NOTE }
}

module.exports = { tst }
