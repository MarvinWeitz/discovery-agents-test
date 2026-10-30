// Atlas section STA · Status lifecycle: state machine from OperationAvailable. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { short } = require('../../analyse/authz')
const { loadSeed } = require('../../analyse/seed-data')
const { uniq } = require('../util')

function sta(g, root, csn, TR) {
  const rules = g.byType('UiRule').filter(r => r.props.kind === 'operation-available' && r.props.domain)
  if (!rules.length) return { TR: [], STATES: null }
  const field = rules[0].props.field, entity = rules[0].props.entity
  const codes = uniq(rules.flatMap(r => r.props.domain))
  const seed = loadSeed(root)
  const cl = Object.keys(seed).find(k => k.endsWith('.' + field) || k.endsWith('-' + field))
  const names = Object.fromEntries((seed[cl]?.rows || []).map(r => [r.code, r.name || r.descr || r.code]))
  const se = g.nodes.get(`svcentity:${entity}`)
  const dbe = csn.definitions[se?.props.projectsOn || entity]
  const el = dbe?.elements?.[field] || dbe?.elements?.[field + '_code']
  const def = el?.default?.val ?? (el?.keys ? dbe.elements[field + '_code']?.default?.val : undefined)
  const ev = Object.fromEntries(rules.map(r => [r.props.action, [r.evidence, ...g.out(r.id, 'enforced_by').concat(g.out(r.id, 'checked_in')).map(e => g.nodes.get(e.to)?.evidence)].filter(Boolean)]))
  return { TR: TR.map(t => ({ ...t, ev: ev[t.a] || [] })), STATES: { field, entity: short(entity), codes, names, default: def ?? null } }
}

module.exports = { sta }
