const test = require('node:test')
const assert = require('node:assert')
const rule = require('./unknown-grant')
const { graph, csn } = require('./_fixture')

test('a grant that names no action (typo)', () => {
  const g = graph({ requires: [['svcentity:S.Orders', 'Approver', 'READ,aprove,reject']] })
  assert.deepStrictEqual(rule.detect({ g, csn }).map(h => h.t), ["Grant 'aprove' on Orders matches no operation"])
})
test('CAP events, bound actions and service functions are fine', () => {
  const g = graph({ requires: [['svcentity:S.Orders', 'A', 'READ,WRITE,approve,*,search,draftActivate']] })
  assert.strictEqual(rule.detect({ g, csn }).length, 0)
})
