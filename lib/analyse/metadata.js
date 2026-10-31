// Step 4b · UI promises as the UI receives them: the OData $metadata CAP generates per service (written by
// the probe to run/edmx/<Service>.xml), parsed with SAP's open-source Fiori tools libraries
// @sap-ux/edmx-parser + @sap-ux/annotation-converter (Apache-2.0, what Fiori elements tooling uses).
//   1. every UiRule from reflexion-ui.js gets `sent`: true when Fiori elements actually receives that
//      annotation, false when it stays in the CDS model only (e.g. on an entity the service does not expose)
//   2. promises that exist only in $metadata, because CAP derives them, become UiRules with the verdict CAP's
//      own runtime gives them:
//        capabilities  Capabilities.Insert/Update/DeleteRestrictions false  -> framework (405, @sap/cds
//                      libx/_runtime/common/generic/auth/capabilities.js)
//        computed      Core.Computed / Core.Immutable fields, static FieldControl #ReadOnly -> framework (input
//                      ignored, @sap/cds lib/req/validate.js _is_readonly / input.js immutable)
// Walkthrough: docs/walkthrough/04-ui-promises.md · Sources: docs/walkthrough/references.md (UI promises)
const fs = require('fs')
const path = require('path')

const MANAGED = /^(createdAt|createdBy|modifiedAt|modifiedBy|LastChanged\w*|Draft\w*|IsActiveEntity|HasActiveEntity|HasDraftEntity|SiblingEntity|DraftAdministrativeData\w*)$/
const OPS = [['InsertRestrictions', 'Insertable', 'create'], ['UpdateRestrictions', 'Updatable', 'update'], ['DeleteRestrictions', 'Deletable', 'delete']]

function load(file) {
  const { parse } = require('@sap-ux/edmx-parser')
  const { convert } = require('@sap-ux/annotation-converter')
  return convert(parse(fs.readFileSync(file, 'utf8')))
}

function metadataPromises(root, g, edmxFiles, evidenceDir = 'edmx') {
  const out = { services: 0, sent: 0, notSent: 0, added: 0, errors: [] }
  const models = {}
  for (const [svc, file] of Object.entries(edmxFiles || {})) {
    try { models[svc] = load(file); out.services++ } catch (e) { out.errors.push(`${svc}: ${e.message.split('\n')[0]}`) }
  }
  if (!out.services) return out
  const svcOf = name => Object.keys(models).filter(s => name.startsWith(s + '.')).sort((a, b) => b.length - a.length)[0]
  const typeOf = name => { const s = svcOf(name); return s && models[s].entityTypes.find(t => t.fullyQualifiedName === name) }
  const setOf = name => { const s = svcOf(name); return s && models[s].entitySets.find(e => e.entityTypeName === name) }
  // evidence: where the entity is declared in the app (file:line); the $metadata file is named in props.metadata
  const ev = name => g.nodes.get(`svcentity:${name}`)?.evidence || `${evidenceDir}/${svcOf(name)}.xml`
  const md = name => `${evidenceDir}/${svcOf(name)}.xml`

  // 1. CSN promises: does the UI receive them?
  for (const r of g.byType('UiRule')) {
    const p = r.props, t = typeOf(p.entity), es = setOf(p.entity)
    if (!t) continue
    let sent = null
    if (p.kind === 'operation-available') sent = models[svcOf(p.entity)].actions.some(a => a.name === p.action && a.isBound && a.sourceType === p.entity && a.annotations.Core?.OperationAvailable !== undefined)
    else if (p.kind === 'field-control') sent = (p.fields || []).some(f => t.entityProperties.find(x => x.name === f)?.annotations.Common?.FieldControl !== undefined)
    else if (p.kind === 'CreateHidden' || p.kind === 'DeleteHidden') sent = t.annotations.UI?.[p.kind] !== undefined || es?.annotations.UI?.[p.kind] !== undefined
    else if (p.kind === 'side-effects') sent = Object.keys(t.annotations.Common || {}).some(k => k.startsWith('SideEffects'))
    if (sent === null) continue
    p.sent = sent
    sent ? out.sent++ : out.notSent++
  }

  // 2. Promises only $metadata shows
  const covered = new Set(g.byType('UiRule').filter(r => ['readonly', 'computed'].includes(r.props.kind)).flatMap(r => (r.props.fields || []).map(f => `${r.props.entity}.${f}`)))
  for (const [svc, m] of Object.entries(models)) {
    for (const es of m.entitySets) {
      const name = es.entityTypeName
      // code lists and auto-exposed entities promise nothing a user edits
      const node = g.nodes.get(`svcentity:${name}`)
      if (!node || node.props.codeList || node.props.generated || node.props.autoexposed) continue
      const cap = es.annotations.Capabilities || {}
      const denied = OPS.filter(([r, k]) => cap[r]?.[k] === false).map(([, , op]) => op)
      if (denied.length && !g.nodes.has(`uirule:${name}:capabilities`)) {
        g.node(`uirule:${name}:capabilities`, 'UiRule', { kind: 'capabilities', entity: name, ui: `no ${denied.join(' / ')}`, fields: denied, server: 'CAP rejects with 405 (Capabilities)', verdict: 'framework', sent: true, metadata: md(name) }, { evidence: ev(name), source: 'tool:edmx', confidence: 'high' })
        out.added++
      }
      const t = es.entityType
      const fields = (t?.entityProperties || []).filter(p => !MANAGED.test(p.name) && !t.keys.some(k => k.name === p.name) && !covered.has(`${name}.${p.name}`) &&
        (p.annotations.Core?.Computed || p.annotations.Core?.Immutable || String(p.annotations.Common?.FieldControl?.valueOf?.() ?? p.annotations.Common?.FieldControl).endsWith('ReadOnly'))).map(p => p.name)
      if (fields.length && !g.nodes.has(`uirule:${name}:computed`)) {
        g.node(`uirule:${name}:computed`, 'UiRule', { kind: 'computed', entity: name, ui: fields.join(', '), fields, server: 'CAP ignores client values (Core.Computed / Immutable / ReadOnly)', verdict: 'framework', sent: true, metadata: md(name) }, { evidence: ev(name), source: 'tool:edmx', confidence: 'high' })
        out.added++
      }
    }
  }
  return out
}

module.exports = { metadataPromises }
