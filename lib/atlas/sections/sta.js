// Atlas section STA · Status lifecycle: state machine from OperationAvailable. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { short } = require('../../analyse/authz')
const { loadSeed } = require('../../analyse/seed-data')
const { uniq } = require('../util')

// A big app has several fields that OperationAvailable reads; the first one found used to become "the"
// lifecycle (smart-core: a boolean feature flag behind a navigation). Each (entity, field) is scored instead:
// a status field has several states from a code list or enum, several actions and server-side checks;
// a flag has true/false and sits behind a path.
function lifecycles(g, seed) {
  const rules = g.byType('UiRule').filter(r => r.props.kind === 'operation-available' && r.props.domain)
  const by = new Map()
  for (const r of rules) { const k = `${r.props.entity}|${r.props.field}`; if (!by.has(k)) by.set(k, []); by.get(k).push(r) }
  const score = rs => {
    const { field } = rs[0].props, codes = uniq(rs.flatMap(r => r.props.domain)), acts = uniq(rs.map(r => r.props.action))
    const bool = codes.every(c => ['true', 'false', true, false].includes(c))
    const path = /[./]/.test(field.replace(/_code$/, ''))
    const codeList = Object.keys(seed).some(k => k.endsWith('.' + field) || k.endsWith('-' + field) || k.toLowerCase().endsWith(field.replace(/_code$/, '').toLowerCase()))
    const enforced = rs.filter(r => ['enforced', 'partial', 'stricter'].includes(r.props.verdict)).length
    const named = /status|state|stage|phase|lifecycle/i.test(field) ? 2 : 0
    const flag = /flag|^is[A-Z_]|\.is[A-Z]|enabled|active$/i.test(field) ? 3 : 0
    return Math.min(codes.length, 6) + 2 * acts.length + (codeList ? 3 : 0) + enforced + named - (bool ? 6 : 0) - (path ? 3 : 0) - flag
  }
  return [...by.values()].map(rs => ({ rules: rs, entity: rs[0].props.entity, field: rs[0].props.field, score: score(rs) }))
    .sort((a, b) => b.score - a.score || b.rules.length - a.rules.length || a.field.localeCompare(b.field))
}

function sta(g, root, csn, TR) {
  const seed = loadSeed(root)
  const cand = lifecycles(g, seed)
  if (!cand.length) return { TR: [], STATES: null }
  const { rules, field, entity } = cand[0]
  const acts = new Set(rules.map(r => r.props.action))
  TR = TR.filter(t => acts.has(t.a))
  const codes = uniq(rules.flatMap(r => r.props.domain))
  const cl = Object.keys(seed).find(k => k.endsWith('.' + field) || k.endsWith('-' + field))
  const names = Object.fromEntries((seed[cl]?.rows || []).map(r => [r.code, r.name || r.descr || r.code]))
  const se = g.nodes.get(`svcentity:${entity}`)
  const dbe = csn.definitions[se?.props.projectsOn || entity]
  const el = dbe?.elements?.[field] || dbe?.elements?.[field + '_code']
  const def = el?.default?.val ?? (el?.keys ? dbe.elements[field + '_code']?.default?.val : undefined)
  const ev = Object.fromEntries(rules.map(r => [r.props.action, [r.evidence, ...g.out(r.id, 'enforced_by').concat(g.out(r.id, 'checked_in')).map(e => g.nodes.get(e.to)?.evidence)].filter(Boolean)]))
  const others = cand.slice(1).map(c => ({ entity: short(c.entity), field: c.field, actions: uniq(c.rules.map(r => r.props.action)), states: uniq(c.rules.flatMap(r => r.props.domain)).length }))
  return { TR: TR.map(t => ({ ...t, ev: ev[t.a] || [] })), STATES: { field, entity: short(entity), codes, names, default: def ?? null, ...(others.length ? { others } : {}) } }
}

module.exports = { sta }
