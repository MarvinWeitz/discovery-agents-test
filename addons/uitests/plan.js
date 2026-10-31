// Turns the UI promises (UiRule nodes from reflexion-ui) into UI test cases for Fiori elements apps.
// One case = one equivalence class: a promise in one state of the record, e.g. "acceptTravel is
// offered when TravelStatus = O". Cases on the same page, record and mode share one "visit"
// (one app start), so a run stays short.
//
// Kinds:
//   action    @Core.OperationAvailable  header action enabled / disabled, display mode
//   field     @Common.FieldControl      fields editable / read-only, edit mode
//   readonly  @readonly                 fields read-only, edit mode
//   create    @UI.CreateHidden          table Create button shown / hidden, edit mode of the parent
//   delete    @UI.DeleteHidden          table Delete button shown / hidden, edit mode of the parent
// Promises without a page, a seed record or a readable condition are listed as skipped, with why.
const fs = require('fs')
const path = require('path')
const { loadSeed } = require('../../lib/analyse/seed-data')

const short = n => String(n).split('.').pop()

// enum symbol (#Open) → value ('O'), from every enum in the model
function enumsOf(csn) {
  const out = {}
  const take = en => { for (const [k, v] of Object.entries(en || {})) out[k] ??= v.val ?? k }
  for (const d of Object.values(csn.definitions)) { take(d.enum); for (const e of Object.values(d.elements || {})) take(e.enum) }
  return out
}
const val = (x, enums) => x?.val !== undefined ? x.val : x?.['#'] !== undefined ? enums[x['#']] ?? x['#'] : undefined

// target definition of an association path from an entity: ['to_Travel', 'TravelStatus'] → defs
function walkAssoc(csn, entity, segs) {
  let d = csn.definitions[entity]
  for (const s of segs) { const e = d?.elements?.[s]; if (!e?.target) return null; d = csn.definitions[e.target]; if (!d) return null }
  return d
}

// "case when code = 'A' then 1 else 7 end" → state => value; null if the shape is not this simple
function caseFn(xpr, enums) {
  if (!Array.isArray(xpr) || xpr[0] !== 'case') return null
  const arms = []; let i = 1, other
  while (xpr[i] === 'when') {
    const [ref, op, lit, then, res] = xpr.slice(i + 1, i + 6)
    if (!ref?.ref || !['=', '!=', '<>'].includes(op) || then !== 'then') return null
    arms.push({ op: op === '=' ? '=' : '!=', v: val(lit, enums), r: val(res, enums) }); i += 6
  }
  if (xpr[i] === 'else') { other = val(xpr[i + 1], enums); i += 2 }
  if (xpr[i] !== 'end' || !arms.length) return null
  return s => { for (const a of arms) if (a.op === '=' ? s === a.v : s !== a.v) return a.r; return other }
}

// "to_Travel.TravelStatus.code != #Open" → { owner: ['to_Travel'], field: 'TravelStatus', test: s => bool }
function condOf(ann, enums) {
  const x = ann?.xpr
  if (!Array.isArray(x) || x.length !== 3 || !x[0]?.ref || !['=', '!=', '<>'].includes(x[1])) return null
  const ref = x[0].ref.filter(r => r !== '$self'), v = val(x[2], enums)
  if (ref[ref.length - 1] === 'code') ref.pop()
  const eq = x[1] === '='
  return { owner: ref.slice(0, -1), field: ref[ref.length - 1], test: s => eq ? s === v : s !== v }
}

// Fiori elements apps with their pages, read from the manifests
function appsOf(g, root) {
  const apps = []
  for (const a of g.byType('UI5App').filter(a => a.props.fioriElements)) {
    const mf = path.join(root, a.props.manifest)
    if (!fs.existsSync(mf)) continue
    const m = JSON.parse(fs.readFileSync(mf, 'utf8')), webapp = path.dirname(mf)
    const ds = m['sap.app']?.dataSources?.[m['sap.ui5']?.models?.['']?.dataSource || 'mainService']
    const svc = g.out(a.id, 'uses').map(e => g.nodes.get(e.to)).find(n => n?.type === 'Service')
    const R = m['sap.ui5']?.routing || {}
    const pages = (R.routes || []).map(r => {
      const t = R.targets?.[[].concat(r.target).pop()] || {}, s = t.options?.settings || {}
      const cp = s.contextPath ? s.contextPath.replace(/^\//, '').split('/') : null
      return { route: r.name, pattern: r.pattern, componentId: t.id || [].concat(r.target).pop(), template: short(t.name || ''), entitySet: s.entitySet || cp?.pop(), settings: s }
    }).filter(p => p.entitySet)
    let boot = null
    try { boot = fs.readFileSync(path.join(webapp, 'index.html'), 'utf8').match(/id=["']sap-ui-bootstrap["'][^>]*?src=["']([^"']+)["']|src=["']([^"']+)["'][^>]*?id=["']sap-ui-bootstrap["']/s) } catch {}
    apps.push({ id: m['sap.app'].id, manifest: a.props.manifest, webapp: path.relative(root, webapp), service: svc?.props.name, dsUri: ds?.uri, bootstrap: boot ? boot[1] || boot[2] : null, pages, raw: m })
  }
  return apps
}

// FieldGroup holding a property, and the facet (section) it sits in, for sap.fe.test onForm()
function formOf(def, prop) {
  const groups = Object.keys(def).filter(k => /^@UI\.FieldGroup#\w+\.Data$/.test(k))
  for (const k of groups) {
    const hit = def[k].map(d => d.Value?.['='] ?? d.Value).find(v => typeof v === 'string' && (v === prop || v.startsWith(prop + '.') || v.startsWith(prop + '_')))
    if (!hit) continue
    const q = k.split('#')[1].split('.')[0]
    const target = `@UI.FieldGroup#${q}`
    const top = (def['@UI.Facets'] || []).find(f => f.Target === target || (f.Facets || []).some(x => x.Target === target))
    if (!top) continue
    // Fiori elements names the form container after the reference facet's ID (falls back to the qualifier)
    const ref = top.Target === target ? top : top.Facets.find(x => x.Target === target)
    return { section: top.ID || q, fieldGroup: ref.ID || q, property: hit.replace(/\./g, '_') }
  }
  return null
}

function plan(g, csn, root) {
  const enums = enumsOf(csn), seed = loadSeed(root), apps = appsOf(g, root)
  const cases = [], skipped = [], visits = new Map()
  const svcEntity = n => g.nodes.get(`svcentity:${n}`)?.props
  const skip = (r, why, what) => skipped.push({ rule: r.id, kind: r.props.kind, what: what || `${short(r.props.entity)}: ${r.props.ui}`, why, ev: r.evidence })

  // object page of an entity in some Fiori elements app, with the chain of pages leading to it
  const pageOf = entity => {
    for (const app of apps) {
      const p = app.pages.find(p => p.template === 'ObjectPage' && p.entitySet === short(entity) && app.service && entity.startsWith(app.service + '.'))
      if (p) return { app, page: p }
    }
    return null
  }
  // seed rows of a service entity
  const rowsOf = entity => seed[svcEntity(entity)?.projectsOn || entity]?.rows || []
  const keyOf = (entity, row, active) => {
    const ks = svcEntity(entity)?.keys || []
    if (!ks.length || ks.some(k => row[k] === undefined)) return null
    return ks.map(k => `${k}=${/^[0-9a-f-]{36}$/i.test(row[k]) || /^-?\d+$/.test(row[k]) && !/ID$|UUID$/.test(k) ? row[k] : `'${row[k]}'`}`).join(',') + `,IsActiveEntity=${active}`
  }
  // a record of `entity` whose owner (via assoc path) has `field` = state; returns rows on the way
  const recordIn = (entity, owner, field, state) => {
    if (!owner.length) { const r = rowsOf(entity).find(r => r[`${field}_code`] === state || r[field] === state); return r ? { row: r, parent: null } : null }
    const assoc = owner[0], pdef = csn.definitions[entity]?.elements?.[assoc]
    if (!pdef?.target || owner.length > 1) return null
    const pent = pdef.target.startsWith((pageOf(entity)?.app.service || '') + '.') ? pdef.target : `${entity.split('.').slice(0, -1).join('.')}.${short(pdef.target)}`
    const pk = svcEntity(pent)?.keys || []
    for (const pr of rowsOf(pent).filter(r => r[`${field}_code`] === state || r[field] === state)) {
      const r = rowsOf(entity).find(r => pk.every(k => r[`${assoc}_${k}`] === pr[k]))
      if (r) return { row: r, parent: { entity: pent, row: pr, assoc } }
    }
    return null
  }
  const domainOf = (entity, owner, field) => {
    const d = walkAssoc(csn, entity, [...owner, field])
    const code = d?.elements?.code, en = code?.enum || csn.definitions[code?.type]?.enum
    if (en) return Object.entries(en).map(([k, v]) => v.val ?? k)
    const ent = owner.length ? csn.definitions[entity]?.elements?.[owner[0]]?.target : entity
    return [...new Set(rowsOf(ent).map(r => r[`${field}_code`] ?? r[field]).filter(Boolean))]
  }
  // readable record name: the first *ID column that is not a UUID (TravelID 00000001)
  const label = row => { const k = Object.keys(row).find(k => /ID$/.test(k) && !/UUID$/.test(k) && !k.includes('_')); return k ? `${k} ${row[k]}` : String(Object.values(row)[0]) }
  // the visit a case belongs to: app start on a record, display or edit mode
  const visitFor = (where, entity, rec, mode) => {
    const { app, page } = where
    const draft = svcEntity(rec.parent ? rec.parent.entity : entity)?.draft
    if (mode === 'edit' && !draft) return null
    const active = mode !== 'edit'
    const rootEnt = rec.parent ? rec.parent.entity : entity, rootRow = rec.parent ? rec.parent.row : rec.row
    const rootKey = keyOf(rootEnt, rootRow, active), ownKey = keyOf(entity, rec.row, active)
    if (!rootKey || !ownKey) return null
    // fill the route pattern: Travel({key})/to_Booking({key2})
    const keys = rec.parent ? [rootKey, ownKey] : [ownKey]
    let k = 0
    const hash = page.pattern.replace(/:\?query:$/, '').replace(/\{\w+\}/g, () => keys[k++] ?? '')
    if (k !== keys.length) return null
    const id = `${app.id}|${hash}`
    if (!visits.has(id)) visits.set(id, { id: `V${visits.size + 1}`, app: app.id, page: page.componentId, entitySet: page.entitySet, mode, hash,
      root: { set: short(rootEnt), key: keyOf(rootEnt, rootRow, true) }, record: `${short(entity)} ${label(rec.row)}${rec.parent ? ` of ${short(rootEnt)} ${label(rootRow)}` : ''}`, cases: [] })
    return visits.get(id)
  }
  const add = (visit, c) => { c.id = `UIT:${c.cls}`; c.visit = visit.id; visit.cases.push(c.id); cases.push(c) }

  for (const r of g.byType('UiRule')) {
    const p = r.props, entity = p.entity, def = csn.definitions[entity]
    if (!def) continue
    const where = pageOf(entity)
    const pair = s => [`UIS:${p.action}:${s}`, `STA:${p.action}:${s}`]

    if (p.kind === 'operation-available') {
      if (!p.domain) { skip(r, 'condition is not a simple comparison on a status field'); continue }
      if (!where) { skip(r, `no Fiori elements object page shows ${short(entity)}`); continue }
      for (const s of p.domain) {
        const rec = recordIn(entity, [], p.field, s)
        const v = rec && visitFor(where, entity, rec, 'display')
        if (!v) { skip(r, `no seed record with ${p.field} = ${s}`, `${p.action} when ${p.field} = ${s}`); continue }
        const on = p.uiAllowed.includes(s)
        add(v, { cls: `${p.action}:${s}`, kind: 'action', rule: r.id, ev: r.evidence, entity: short(entity), state: s, field: p.field, title: `${p.action} ${on ? 'offered' : 'disabled'} when ${p.field} = ${s}`,
          check: { action: p.action, service: entity.split('.').slice(0, -1).join('.'), enabled: on }, ui: on ? 'allows' : 'blocks', server: p.srvAllowed.includes(s) ? 'allows' : 'blocks', pair: pair(s) })
      }
    }

    else if (p.kind === 'field-control') {
      const fcPath = (p.ui.match(/controlled by (\S+)/) || [])[1]
      const segs = fcPath ? fcPath.split('.') : []
      const calc = segs.length >= 2 ? walkAssoc(csn, entity, segs.slice(0, -1))?.elements?.[segs[segs.length - 1]] : null
      const fn = calc && caseFn((calc.value || calc.$calc)?.xpr, enums)
      if (!fn) { skip(r, 'field control is not a simple case expression on a status code'); continue }
      if (!where) { skip(r, `no Fiori elements object page shows ${short(entity)}`); continue }
      const owner = segs.slice(0, -2), field = segs[segs.length - 2]
      for (const s of domainOf(entity, owner, field)) {
        const fc = fn(s), rec = recordIn(entity, owner, field, s)
        const v = rec && visitFor(where, entity, rec, 'edit')
        if (!v) { skip(r, `no seed record with ${field} = ${s} on an object page in edit mode`, `${short(entity)} fields when ${field} = ${s}`); continue }
        const fields = p.fields.map(f => ({ f, form: formOf(def, f) }))
        for (const x of fields.filter(x => !x.form)) skip(r, 'field is not in a field group on the object page', `${short(entity)}.${x.f}`)
        const located = fields.filter(x => x.form)
        if (!located.length) continue
        const editable = fc !== 1 && fc !== 0
        add(v, { cls: `fieldcontrol:${short(entity)}:${s}`, kind: 'field', rule: r.id, ev: r.evidence, entity: short(entity), state: s, field, title: `${short(entity)}: ${located.length} field(s) ${editable ? 'editable' : 'read-only'} when ${field} = ${s}`,
          check: { fields: located.map(x => x.form), editable }, ui: editable ? 'allows' : 'blocks', server: p.verdict === 'ui-only' ? 'allows' : 'blocks', pair: [`UIS:field-control:${short(entity)}`] })
      }
    }

    else if (p.kind === 'CreateHidden' || p.kind === 'DeleteHidden') {
      const cond = condOf(def[`@UI.${p.kind}`], enums)
      if (!cond || cond.owner.length !== 1) { skip(r, 'condition is not a comparison on the parent status'); continue }
      // the table sits on the parent's object page: parent entity via the association back
      const parent = csn.definitions[entity]?.elements?.[cond.owner[0]]?.target
      const pEnt = parent && (svcEntity(parent) ? parent : `${entity.split('.').slice(0, -1).join('.')}.${short(parent)}`)
      const nav = pEnt && Object.entries(csn.definitions[pEnt]?.elements || {}).find(([, e]) => e.target && short(e.target) === short(entity) && e.type === 'cds.Composition')?.[0]
      const pw = pEnt && pageOf(pEnt)
      if (!nav || !pw) { skip(r, `no object page of the parent shows the ${short(entity)} table`); continue }
      const which = p.kind === 'CreateHidden' ? 'Create' : 'Delete'
      for (const s of domainOf(pEnt, [], cond.field)) {
        const rec = recordIn(pEnt, [], cond.field, s)
        const v = rec && visitFor(pw, pEnt, rec, 'edit')
        if (!v) { skip(r, `no seed record with ${cond.field} = ${s}`, `${which} ${short(entity)} when ${cond.field} = ${s}`); continue }
        const hidden = cond.test(s)
        add(v, { cls: `${which.toLowerCase()}:${short(entity)}:${s}`, kind: which.toLowerCase(), rule: r.id, ev: r.evidence, entity: short(entity), state: s, field: cond.field, title: `${which} ${short(entity)} ${hidden ? 'hidden' : 'shown'} when ${cond.field} = ${s}`,
          check: { table: nav, button: which, visible: !hidden }, ui: hidden ? 'blocks' : 'allows', server: p.verdict === 'ui-only' ? 'allows' : 'blocks', pair: [`UIS:${p.kind}:${short(entity)}`] })
      }
    }

    else if (p.kind === 'readonly') {
      if (!where) { skip(r, `no Fiori elements object page shows ${short(entity)}`); continue }
      const located = p.fields.map(f => formOf(def, f)).filter(Boolean)
      if (!located.length) { skip(r, 'none of the fields is in a field group on the object page'); continue }
      // any record that can be edited: prefer one whose status leaves other fields editable
      const rec = rowsOf(entity).map(row => ({ row, parent: null })).find(x => visitFor(where, entity, x, 'edit'))
      const v = rec && visitFor(where, entity, rec, 'edit')
      if (!v) { skip(r, 'no editable seed record'); continue }
      add(v, { cls: `readonly:${short(entity)}`, kind: 'readonly', rule: r.id, ev: r.evidence, entity: short(entity), state: null, title: `${short(entity)}: ${located.map(f => f.property).join(', ')} read-only in edit mode`,
        check: { fields: located, editable: false }, ui: 'blocks', server: 'blocks', pair: [`FW:${entity}:ro`] })
    }

    else if (p.kind === 'side-effects') skip(r, 'needs a value oracle (what the target should become); covered by the backend recompute tests')
    else if (p.kind === 'mandatory') skip(r, 'checked on save by CAP; the backend framework tests cover it')
    else if (p.kind === 'assert.range') skip(r, 'checked by CAP on the action call; the backend boundary tests cover it')
  }

  // the user the UI tests sign in as: the mock user with the most roles (basic auth on the CAP server)
  const users = g.byType('MockUser').map(u => u.props).sort((a, b) => (b.roles?.length || 0) - (a.roles?.length || 0))
  // state value → enum name (O → Open), in declaration order, for column headers
  const names = {}
  for (const c of cases) if (c.state != null && names[c.state] === undefined) names[c.state] = Object.keys(enums).find(k => enums[k] === c.state && k !== c.state) || ''
  return {
    states: names,
    apps: apps.filter(a => [...visits.values()].some(v => v.app === a.id)).map(({ raw, pages, ...a }) => ({ ...a, pages: pages.map(({ settings, ...p }) => p) })),
    visits: [...visits.values()], cases, skipped, user: users[0] ? { name: users[0].name, password: users[0].password ?? '' } : null
  }
}

module.exports = { plan, caseFn, condOf, formOf }
