// Model extractor: CDS sources -> CSN (via the CDS compiler) -> graph facts.
// Nothing here is guessed; everything comes from the compiled model.
// Step 2 · Walkthrough: docs/walkthrough/02-model.md · Sources: docs/walkthrough/references.md (Model)
const { loc } = require('../graph')
const { cap, compiledModel } = require('../project/cap')

const isExternal = d => !d.$location || /node_modules/.test(d.$location.file)
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

// URL path of a served service: what CAP computes (cds.compile.to.serviceinfo, which follows @path,
// @protocol, cds.odata/protocols config and the cds version's defaults); the rule below only when the
// probe has no answer
function servicePathOf(root, name, def) {
  const s = (cap(root).services || []).find(x => x.name === name)
  const e = s?.endpoints.find(x => /^odata/.test(x.kind)) || s?.endpoints[0]
  return e ? { path: e.path, protocols: s.endpoints.map(x => x.kind) } : { path: servicePath(name, def) }
}

function servicePath(name, def) {
  const p = def['@path'] || (typeof def['@odata'] === 'string' ? def['@odata'] : null) // @(odata: '/admin') names the OData path
  if (p) return p.startsWith('/') ? p : `/odata/v4/${p}`
  return `/odata/v4/${kebab(name.split('.').pop().replace(/Service$/, ''))}`
}

// A code list: includes sap.common.CodeList (CAP's own aspect), or has its shape code + name + descr
const isCodeList = def => !!def && ((def.includes || []).includes('sap.common.CodeList') || (!!def.elements?.code && !!def.elements?.name && !!def.elements?.descr))

// Built-in type of an element or parameter, following derived types (type Percentage : Decimal): CAP's
// linked model resolves it (definition._type); the walk through csn.definitions only when linking fails
const linkedOf = new WeakMap()
function linked(csn) { if (!linkedOf.has(csn)) { let l = null; try { l = require('@sap/cds').linked(JSON.parse(JSON.stringify(csn))) } catch {} linkedOf.set(csn, l) } return linkedOf.get(csn) }
function builtin(csn, t) {
  if (!t || String(t).startsWith('cds.')) return t || null
  const viaCap = linked(csn)?.definitions[t]?._type
  if (viaCap) return viaCap
  for (let i = 0; t && !String(t).startsWith('cds.') && i < 10; i++) t = csn.definitions[t]?.type; return t || null
}
const paramTypes = (csn, params) => Object.fromEntries(Object.entries(params || {}).map(([k, p]) => [k, p.enum ? { type: builtin(csn, p.type), enum: Object.keys(p.enum) } : builtin(csn, p.type || p.items?.type)]))

// Fields marked as personal data with CAP's @PersonalData vocabulary
const personalFields = def => Object.entries(def.elements || {}).filter(([, e]) => e['@PersonalData.IsPotentiallyPersonal'] || e['@PersonalData.IsPotentiallySensitive']).map(([k]) => k)

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
  const csn = await compiledModel(root, cds)
  const linked = cds.linked(csn)
  const defs = csn.definitions
  const serviceOf = name => Object.keys(defs).find(s => defs[s].kind === 'service' && name.startsWith(s + '.'))
  // Imported APIs (cds import of an EDMX: S/4HANA, ByD, B1 ...) are consumed, not served: one ExternalService node each
  const remoteOf = name => { const s = serviceOf(name) || (defs[name]?.kind === 'service' ? name : null); return s && defs[s]['@cds.external'] ? s : null }
  const idOf = name => remoteOf(name) ? `remote:${remoteOf(name)}` : serviceOf(name) ? `svcentity:${name}` : `entity:${name}`

  for (const [name, def] of Object.entries(defs)) {
    if (isExternal(def)) continue
    const ev = { evidence: loc(def.$location), source: 'tool:csn' }

    if (remoteOf(name)) {
      if (def.kind === 'service') g.node(`remote:${name}`, 'ExternalService', { name, imported: true, entities: Object.keys(defs).filter(d => d.startsWith(name + '.') && defs[d].kind === 'entity').length }, ev)
      continue
    }

    if (def.kind === 'service') {
      g.node(`service:${name}`, 'Service', { name, ...servicePathOf(root, name, def) }, ev)
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
        generated, uiAnnotations: ui, readonly: !!def['@readonly'], elementNames: Object.keys(def.elements || {}), keys: Object.entries(def.elements || {}).filter(([k, e]) => e.key && k !== 'IsActiveEntity').map(([k]) => k), projectsOn: def.projection?.from?.ref?.[0] || def.query?.SELECT?.from?.ref?.[0] || null, codeList: isCodeList(def), ...(personalFields(def).length ? { personal: personalFields(def) } : {}),
      }, ev)
      if (svc) g.edge(`service:${svc}`, 'exposes', id, {}, ev)

      const src = def.projection?.from?.ref?.[0] || def.query?.SELECT?.from?.ref?.[0]
      if (src) g.edge(id, 'projects_on', idOf(src), remoteOf(src) ? { entity: src.slice(remoteOf(src).length + 1) } : {}, { evidence: loc(def.projection?.$location || def.$location), source: 'tool:csn' })
      if (def['@cds.persistence.exists']) g.nodes.get(id).props.persistenceExists = def['@cds.persistence.calcview'] ? 'calcview' : true

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
        g.node(aid, 'Action', { name: an, bound: true, kind: a.kind, params: Object.keys(a.params || {}), paramTypes: paramTypes(csn, a.params) }, { evidence: loc(a.$location || def.$location), source: 'tool:csn' })
        g.edge(id, 'has_action', aid, {}, ev)
      }
    }

    if (def.kind === 'action' || def.kind === 'function') {
      const svc = serviceOf(name)
      const aid = `action:${name}`
      g.node(aid, 'Action', { name, bound: false, kind: def.kind, params: Object.keys(def.params || {}), paramTypes: paramTypes(csn, def.params) }, ev)
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

module.exports = { isCodeList, extractModel }
