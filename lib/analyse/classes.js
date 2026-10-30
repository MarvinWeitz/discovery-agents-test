// Equivalence-class seeds that can be derived without an LLM: from CSN constraints,
// authorization annotations, draft enablement and handler rules found by static analysis.
// Classes hang on the element / rule / entity (not on the slice), so slices sharing them share tests.

function elementClasses(n) {
  const p = n.props, out = []
  const c = (name, kind, example) => out.push({ name, kind, example })
  if (p.enum) { p.enum.forEach(e => c(`${p.name} = ${e.name}`, 'valid', e.value)); c(`${p.name} not in enum`, 'invalid', 'X') }
  if (p['assert.format']) { c(`${p.name} matches ${p['assert.format']}`, 'valid', null); c(`${p.name} violates format`, 'invalid', null) }
  if (p['assert.range']) { c(`${p.name} inside range`, 'valid', null); c(`${p.name} below range`, 'invalid', null); c(`${p.name} above range`, 'invalid', null) }
  if (p.length) { c(`${p.name} length = ${p.length}`, 'boundary', p.length); c(`${p.name} length = ${p.length + 1}`, 'invalid', p.length + 1) }
  if (p.default !== undefined) { c(`${p.name} omitted -> default ${JSON.stringify(p.default)}`, 'valid', null); c(`${p.name} given explicitly`, 'valid', null) }
  if (p.mandatory || p.notNull || p['assert.notNull']) c(`${p.name} missing`, 'invalid', null)
  if (p.calculated) { c(`${p.name} computed from inputs`, 'valid', null); c(`${p.name} written by client is ignored`, 'invalid', null) }
  if (p.readonly) c(`${p.name} written by client is ignored`, 'invalid', null)
  return out
}

function deriveClasses(g) {
  const groups = []
  for (const n of g.byType('Element')) {
    const classes = elementClasses(n)
    if (classes.length) groups.push({ on: n.id, technique: 'equivalence partitioning + boundaries', evidence: n.evidence, classes })
  }
  for (const r of g.byType('Rule')) {
    const p = r.props
    const classes = p.kind === 'rejection'
      ? [{ name: `${p.guard || 'guard'} is true -> rejected: ${p.message || ''}`.trim(), kind: 'invalid' }, { name: `${p.guard || 'guard'} is false -> accepted`, kind: 'valid' }]
      : p.guard ? [{ name: `${p.guard} is true -> ${p.field} derived`, kind: 'valid' }, { name: `${p.guard} is false -> ${p.field} unchanged`, kind: 'valid' }]
      : [{ name: `${p.field} always derived by the server`, kind: 'valid' }, { name: `${p.field} sent by client is overwritten`, kind: 'valid' }]
    groups.push({ on: r.id, technique: 'decision table (guard true/false)', evidence: r.evidence, classes })
  }
  for (const e of g.edges.filter(e => e.rel === 'requires')) {
    const role = e.to.replace('role:', '')
    groups.push({ on: e.from, technique: 'role x operation matrix', evidence: e.evidence, classes: [
      { name: `user with role ${role} -> ${e.props.grant} allowed`, kind: 'valid' },
      { name: `user without role ${role} -> 403`, kind: 'invalid' },
      { name: 'anonymous user -> 401', kind: 'invalid' },
    ] })
  }
  for (const n of g.byType('ServiceEntity').filter(n => n.props.draft)) {
    groups.push({ on: n.id, technique: 'state transitions (draft)', evidence: n.evidence, classes: [
      { name: 'new -> draft created', kind: 'valid' }, { name: 'draft -> activate (save)', kind: 'valid' },
      { name: 'active -> edit -> draft', kind: 'valid' }, { name: 'draft -> discard', kind: 'valid' },
      { name: 'edit while another user holds the draft', kind: 'invalid' },
    ] })
  }
  return groups
}

module.exports = { deriveClasses }
