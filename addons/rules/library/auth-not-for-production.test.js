const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const rule = require('./auth-not-for-production')
const app = cds => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-')); fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'x', cds }, null, 2)); return d }
const users = { kind: 'mocked', users: { alice: { roles: ['A'] } } }

test('top-level mocked users without a production override stay mocked in production', () => {
  assert.deepStrictEqual(rule.detect({ root: app({ requires: { auth: users } }) }).map(h => h.t), ['Production uses mocked authentication'])
})
test('dummy auth in [production]', () => {
  assert.deepStrictEqual(rule.detect({ root: app({ requires: { auth: users, '[production]': { auth: 'dummy' } } }) }).map(h => h.t), ['Production uses dummy authentication'])
})
test('mocked in [development], xsuaa in [production]; and no auth config at all', () => {
  assert.strictEqual(rule.detect({ root: app({ requires: { '[development]': { auth: users }, '[production]': { auth: 'xsuaa' } } }) }).length, 0)
  assert.strictEqual(rule.detect({ root: app({}) }).length, 0)
})
