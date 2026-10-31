// Atlas section DAT · Data model: entities, composition tree, PII. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { piiFields, short } = require('../../analyse/authz')
const { loadSeed } = require('../../analyse/seed-data')
const { uniq } = require('../util')

function dat(g, root) {
  const seed = loadSeed(root)
  const ents = g.byType('Entity').filter(n => !n.id.endsWith('.texts'))
  const svcOf = id => g.edges.filter(e => e.rel === 'projects_on' && e.to === id).map(e => g.nodes.get(e.from)).filter(Boolean)
  const draftRoots = new Set(ents.filter(n => svcOf(n.id).some(s => s.props.draft)).map(n => n.id))
  const inDraft = new Set(), walkC = id => { for (const e of g.out(id, 'composes')) if (!inDraft.has(e.to) && !e.to.endsWith('.texts')) { inDraft.add(e.to); walkC(e.to) } }
  for (const r of draftRoots) { inDraft.add(r); walkC(r) }
  const kind = n => n.props.codeList ? 'cl' : n.props.name.startsWith('sap.common.') ? 'cm' : inDraft.has(n.id) ? 'tx' : 'md'
  const ENT = ents.map(n => [short(n.id), kind(n), Math.min(14, (n.props.elementNames || []).length), draftRoots.has(n.id) ? 'draft root' : inDraft.has(n.id) ? 'composition' : piiFields(n).length ? 'PII' : null, piiFields(n).length ? 1 : 0, (n.props.elementNames || []).filter(x => !/_code$|_ID$|^ID$|UUID$|^(createdAt|createdBy|modifiedAt|modifiedBy|LastChangedAt|LastChangedBy|LocalLastChangedAt)$|^to_|^Is|^Has|Draft/.test(x)).slice(0, 3)])
  const names = new Set(ENT.map(e => e[0]))
  const REL = []
  for (const e of g.edges.filter(e => (e.rel === 'composes' || e.rel === 'associates') && e.from.startsWith('entity:') && e.to.startsWith('entity:'))) {
    const f = short(e.from), t = short(e.to)
    if (!names.has(f) || !names.has(t) || f === t) continue
    if (!REL.some(r => r[0] === f && r[1] === t)) REL.push([f, t, e.rel === 'composes' ? 'comp' : 'as', e.props.element])
  }
  const grantsOn = n => g.out(n.id, 'requires').length || g.in(n.id, 'exposes').some(e => g.out(e.from, 'requires').length)
  const DAT_ROWS = ents.map(n => {
    const svcs = svcOf(n.id)
    const exposed = uniq(svcs.map(s => s.props.service + (s.props.autoexposed ? ' (auto)' : '')))
    const pii = piiFields(n).length
    const guarded = svcs.some(grantsOn), inherits = !guarded && inDraft.has(n.id) && !draftRoots.has(n.id)
    const restrict = !svcs.length ? 'n' : pii && svcs.some(s => !grantsOn(s)) && !inherits ? 'r' : guarded ? 'y' : inherits ? 'a' : pii ? 'r' : 'n'
    const hooks = g.byType('Handler').filter(h => (h.props.targets || [h.props.target]).some(t => svcs.some(s => s.props.name === t))).length
    const rows = seed[n.props.name]?.rows.length || 0
    return [short(n.id), kind(n), draftRoots.has(n.id) ? 'y' : 'n', exposed.join(', ') || 'not exposed', restrict, pii ? (svcs.some(s => !grantsOn(s)) && !inherits ? 'r' : 'y') : 'n', String(hooks), String(rows)]
  }).sort((a, b) => ['tx', 'md', 'cl', 'cm'].indexOf(a[1]) - ['tx', 'md', 'cl', 'cm'].indexOf(b[1]))
  return { ENT, REL, DAT_ROWS }
}

module.exports = { dat }
