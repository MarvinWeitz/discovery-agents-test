// addon measured: OData keys from seed rows, static vs measured authorization, rules reached by coverage
const { test } = require('node:test')
const assert = require('node:assert')
const { keyOf, compareAuthz, rulesReached, summarizeRequests } = require('../addons/measured')

test('keyOf builds OData key predicates from seed rows', () => {
  const csn = { definitions: {
    B: { elements: { ID: { key: true, type: 'cds.Integer' }, title: { type: 'cds.String' } } },
    T: { elements: { ID: { key: true, type: 'cds.String' }, IsActiveEntity: { key: true, type: 'cds.Boolean' } } },
  } }
  assert.equal(keyOf(csn, 'B', { ID: '1' }), '(1)')
  assert.equal(keyOf(csn, 'T', { ID: "o'k" }, true), "(ID='o''k',IsActiveEntity=true)")
  assert.equal(keyOf(csn, 'B', {}), null)
})

test('compareAuthz marks agree, differ and unclear cells', () => {
  const D = { AUTH: [{ c: ['y', 'n', { v: 'a' }] }] }
  const r = compareAuthz(D, { users: ['u1', 'u2', 'u3'], results: [{ row: 0, op: 'X READ', cells: [{ user: 'u1', v: 'y', status: 200 }, { user: 'u2', v: 'y', status: 200 }, { user: 'u3', v: 'n', status: 403 }] }] })
  assert.deepEqual([r.agree, r.differ, r.unclear], [1, 1, 1])
})

test('rulesReached reads executed lines', () => {
  const nodes = [{ type: 'Rule', id: 'r1', evidence: 'srv/a.js:3', props: { kind: 'guard' } }, { type: 'Rule', id: 'r2', evidence: 'srv/a.js:9', props: { kind: 'guard' } }]
  const r = rulesReached(nodes, new Map([['srv/a.js', new Set([3])]]))
  assert.equal(r.reached, 1); assert.equal(r.never[0].id, 'r2')
})

test('summarizeRequests groups by entity and event', () => {
  const s = summarizeRequests([{ entity: 'B', event: 'READ', user: 'a', file: 't', status: 200 }, { entity: 'B', event: 'READ', user: 'b', file: 't', status: 403 }])
  assert.equal(s.rows[0].n, 2); assert.deepEqual(s.users, ['a', 'b'])
})

test('readRequests: legacy draft entries and rejected requests get their entity from the URL', () => {
  const fs = require('fs'), os = require('os'), path = require('path')
  const { readRequests } = require('../addons/measured/read')
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'msr-')); fs.mkdirSync(path.join(d, 'requests'))
  fs.writeFileSync(path.join(d, 'requests', 'a.jsonl'), [
    { entity: 'drafts', event: 'NEW', url: '/processor/Travel', method: 'POST' },
    { entity: null, event: null, url: '/processor/Travel?$top=1', method: 'GET', status: 403 },
  ].map(x => JSON.stringify(x)).join('\n'))
  assert.deepEqual(readRequests(d).map(r => [r.entity, r.event]), [['Travel', 'NEW'], ['Travel', 'READ']])
})
