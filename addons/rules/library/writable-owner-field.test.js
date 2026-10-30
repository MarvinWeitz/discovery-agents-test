const test = require('node:test')
const assert = require('node:assert')
const rule = require('./writable-owner-field')

const graph = where => ({ edges: [{ rel: 'requires', from: 'svcentity:S.Person', to: 'role:Employee', props: { grant: 'READ,UPDATE', where }, evidence: 'srv/s.cds:4' }] })
const csn = el => ({ definitions: { 'S.Person': { elements: { Email: el, ID: { key: true } } } } })

test('finds a writable ownership field (event app A1)', () => {
  const hits = rule.detect({ g: graph('Email = $user.id'), csn: csn({ type: 'cds.String' }) })
  assert.deepStrictEqual(hits.map(h => h.ev), ['srv/s.cds:4'])
})
test('accepts a read-only or insert-only field', () => {
  assert.strictEqual(rule.detect({ g: graph('Email = $user'), csn: csn({ '@readonly': true }) }).length, 0)
  assert.strictEqual(rule.detect({ g: graph('Email = $user'), csn: csn({ '@cds.on.insert': { '=': '$user' } }) }).length, 0)
})
test('ignores read-only grants', () => {
  const g = graph('Email = $user'); g.edges[0].props.grant = 'READ'
  assert.strictEqual(rule.detect({ g, csn: csn({}) }).length, 0)
})
