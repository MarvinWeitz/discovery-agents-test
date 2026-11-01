const test = require('node:test')
const assert = require('node:assert')
const rule = require('./unknown-role')
const { graph } = require('./_fixture')

test('a role no mock user holds (no xs-security.json)', () => {
  const g = graph({ users: { alice: ['Buyer'], admin: ['Admin'] }, requires: [['service:S', 'Admins', '*'], ['svcentity:S.Orders', 'Buyer', 'READ']] })
  const hits = rule.detect({ g })
  assert.deepStrictEqual(hits.map(h => h.t), ["Role 'Admins' on S is held by no mock user"])
  assert.match(hits[0].d, /did you mean 'Admin'/)
})
test('with xs-security.json the scopes decide; pseudo roles are ignored', () => {
  const g = graph({ users: { admin: ['Admin'] }, xs: ['Buyer'], requires: [['service:S', 'Admin', '*'], ['service:S', 'authenticated-user', '*'], ['svcentity:S.Orders', 'Buyer', 'READ']] })
  assert.deepStrictEqual(rule.detect({ g }).map(h => h.t), ["Role 'Admin' on S is not a scope in xs-security.json"])
})
test('nothing to compare with: no users, no xs-security.json', () => {
  assert.strictEqual(rule.detect({ g: graph({ requires: [['service:S', 'X', '*']] }) }).length, 0)
})
