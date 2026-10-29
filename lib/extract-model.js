// Model extractor: CDS sources -> CSN (via the CDS compiler) -> graph facts.
// Nothing here is guessed; everything comes from the compiled model.
const path = require('path')
const { loc } = require('./graph')

const isExternal = d => !d.$location || /node_modules/.test(d.$location.file)
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

function servicePath(name, def) {
  const p = def['@path']
  if (p) return p.startsWith('/') ? p : `/odata/v4/${p}`
  return `/odata/v4/${kebab(name.split('.').pop().replace(/Service$/, ''))}`
}

function roles(def) {
  const out = []
  const req = def['@requires']
  if (req) out.push(...[].concat(req).map(r => ({ role: r, grant: '*' })))
  for (const r of def['@restrict'] || []) {
    for (const to of [].concat(r.to || 'any')) out.push({ role: to, grant: [].concat(r.grant || '*').join(','), where: r.where })
  }
  return out
}

function constraints(el) {
  const c = {}
  if (el.enum) c.enum = Object.entries(el.enum).map(([k, v]) => ({ name: k, value: v.val ?? k }))
  if (el.length) c.length = el.length
  if (el.precision) c.precision = el.precision
  if (el.scale !== undefined) c.scale = el.scale
  if (el.default) c.default = el.default.val ?? el.default
  if (el.notNull) c.notNull = true
  if (el.key) c.key = true
  if (el.value) c.calculated = true
  for (const [k, v] of Object.entries(el)) if (/^@(assert|mandatory|readonly|Core\.Immutable|insertonly)/.test(k)) c[k.slice(1)] = v
  return c
}

async function extractModel(cds, root, g) {
  const dirs = ['db', 'srv', 'app'].map(d => path.join(root, d))
  const csn = await cds.load(dirs, { locations: true })
  const linked = cds.linked(csn)
  const defs = csn.definitions
  const serviceOf = name => Object.keys(defs).find(s => defs[s].kind === 'service' && name.startsWith(s + '.'))
  const idOf = name => serviceOf(name) ? `svcentity:${name}` : `entity:${name}`

  for (const [name, def] of Object.entries(defs)) {
    if (isExternal(def)) continue
    const ev = { evidence: loc(def.$location), source: 'tool:csn' }

    if (def.kind === 'service') {
      g.node(`service:${name}`, 'Service', { name, path: servicePath(name, def) }, ev)
      for (const r of roles(def)) {
        g.node(`role:${r.role}`, 'Role', { name: r.role })
        g.edge(`service:${name}`, 'requires', `role:${r.role}`, { grant: r.grant, where: r.where }, ev)
      }
    }

    if (def.kind === 'entity') {
      const svc = serviceOf(name)
      const id = idOf(name)
      const generated = name.endsWith('.texts') || (svc && !def.projection && !def.query)
      const ui = Object.keys(def).filter(k => k.startsWith('@UI.')).length
      g.node(id, svc ? 'ServiceEntity' : 'Entity', {
        name, service: svc, draft: !!def['@odata.draft.enabled'], autoexposed: !!(linked.definitions[name]?.['@cds.autoexposed']),
        generated, uiAnnotations: ui, readonly: !!def['@readonly'], elementNames: Object.keys(def.elements || {}), keys: Object.entries(def.elements || {}).filter(([k, e]) => e.key && k !== 'IsActiveEntity').map(([k]) => k), projectsOn: def.projection?.from?.ref?.[0] || def.query?.SELECT?.from?.ref?.[0] || null, codeList: !!def.elements?.code && !!def.elements?.name && !!def.elements?.descr,
      }, ev)
      if (svc) g.edge(`service:${svc}`, 'exposes', id, {}, ev)

      const src = def.projection?.from?.ref?.[0] || def.query?.SELECT?.from?.ref?.[0]
      if (src) g.edge(id, 'projects_on', idOf(src), {}, { evidence: loc(def.projection?.$location || def.$location), source: 'tool:csn' })

      for (const r of roles(def)) {
        g.node(`role:${r.role}`, 'Role', { name: r.role })
        g.edge(id, 'requires', `role:${r.role}`, { grant: r.grant, where: r.where }, ev)
      }

      for (const [en, el] of Object.entries(def.elements || {})) {
        const eev = { evidence: loc(el.$location || def.$location), source: 'tool:csn' }
        if (el.$location && /node_modules/.test(el.$location.file)) continue
        if (el.target && defs[el.target] && !isExternal(defs[el.target])) {
          g.edge(id, el.type === 'cds.Composition' ? 'composes' : 'associates', idOf(el.target), { element: en, many: el.cardinality?.max === '*' }, eev)
        }
        // Constraint-bearing elements of persisted entities; elements inherited from aspects (no own location) are skipped
        if (!svc && el.$location && !name.endsWith('.texts')) {
          const c = constraints(el)
          const interesting = Object.keys(c).some(k => k !== 'key' && !(k === 'length' && el.type === 'cds.UUID'))
          if (interesting) {
            const eid = `element:${name}.${en}`
            g.node(eid, 'Element', { entity: name, name: en, type: el.type || el.items?.type, association: el.target || undefined, ...c }, eev)
            g.edge(id, 'has_element', eid, {}, eev)
          }
        }
      }

      for (const [an, a] of Object.entries(def.actions || {})) {
        const aid = `action:${name}.${an}`
        g.node(aid, 'Action', { name: an, bound: true, kind: a.kind, params: Object.keys(a.params || {}) }, { evidence: loc(a.$location || def.$location), source: 'tool:csn' })
        g.edge(id, 'has_action', aid, {}, ev)
      }
    }

    if (def.kind === 'action' || def.kind === 'function') {
      const svc = serviceOf(name)
      const aid = `action:${name}`
      g.node(aid, 'Action', { name, bound: false, kind: def.kind, params: Object.keys(def.params || {}) }, ev)
      if (svc) g.edge(`service:${svc}`, 'has_action', aid, {}, ev)
    }

    if (def.kind === 'event') {
      g.node(`event:${name}`, 'Event', { name, payload: Object.keys(def.elements || {}) }, ev)
      const svc = serviceOf(name)
      if (svc) g.edge(`service:${svc}`, 'declares_event', `event:${name}`, {}, ev)
    }
  }
  return csn
}

module.exports = { extractModel }
