// Atlas section ARC · Architecture: container map and layer stack. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const fs = require('fs')
const path = require('path')
const { piiFields, short } = require('../../analyse/authz')
const { walk } = require('../../project/files')
const { layout } = require('../../project/layout')
const config = require('../../project/config')
const { base, uniq } = require('../util')

function arc(g, root, metrics) {
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const has = f => fs.existsSync(path.join(root, f))
  const zones = []
  const apps = g.byType('UI5App')
  const xs = has('xs-security.json') ? JSON.parse(fs.readFileSync(path.join(root, 'xs-security.json'), 'utf8')) : null
  zones.push({ label: 'UI · app/*/webapp', boxes: [
    ...apps.map(a => ({ id: a.id, t: a.props.id.split('.').pop(), lines: [uniq(g.out(a.id, 'has_route').map(r => String(g.nodes.get(r.to)?.props.template || '').split('.').pop())).filter(Boolean).join(' + ') || (a.props.fioriElements ? 'Fiori elements' : 'freestyle'), ...(g.out(a.id, 'has_view').length ? [`§${g.out(a.id, 'has_view').length} extension views`] : [])], cls: 'ac' })),
    ...(xs ? [{ id: 'xsuaa', t: 'XSUAA', lines: [`${(xs.scopes || []).length} scopes · ${(xs['role-templates'] || []).length} templates`], cls: 'sk' }] : [])] })
  const svcs = g.byType('Service')
  zones.push({ label: 'ODATA SERVICES · srv/*.cds', boxes: svcs.map(s => {
    const ex = g.out(s.id, 'exposes').map(e => g.nodes.get(e.to)).filter(n => n && !n.props.generated && !n.id.endsWith('.texts'))
    const gr = g.out(s.id, 'requires').length + ex.reduce((a, n) => a + g.out(n.id, 'requires').length, 0)
    const pii = ex.some(n => piiFields(n).length)
    return { id: s.id, t: `${short(s.id)} ${s.props.path}`, lines: [`${ex.length} entity sets${ex.some(n => n.props.draft) ? ' · draft' : ''} · ${ex.reduce((a, n) => a + g.out(n.id, 'has_action').length, 0)} actions`, gr ? `§${gr} grants` : '§no @requires / @restrict'], cls: !gr && pii ? 'cr' : '' }
  }) })
  const files = g.byType('SourceFile').filter(f => g.in(f.id, 'implemented_in').length)
  const typer = f => { try { return /#cds-models/.test(fs.readFileSync(path.join(root, f.props.path), 'utf8')) } catch { return false } }
  zones.push({ label: 'RUNTIME · CAP NODE.JS', boxes: [
    ...files.map(f => { const hs = g.byType('Handler').filter(h => h.props.file === f.props.path); return { id: f.id, t: f.props.path, lines: [`${hs.length} handlers · ${hs.reduce((a, h) => a + g.out(h.id, 'enforces').length, 0)} rules`, ...(typer(f) ? ['§cds-typer · TypeScript'] : [])], cls: 'ac' } }),
    ...svcs.filter(s => !g.out(s.id, 'implemented_in').length).map(s => ({ id: 'generic:' + s.id, t: `${short(s.id)}: generic`, lines: ['CAP default handlers only'], cls: 'sk' })),
    ...g.byType('ExternalService').map(r => ({ id: r.id, t: r.props.name, lines: [r.props.kind], cls: 'sk' })),
    ...g.byType('MessagingBroker').map(r => ({ id: r.id, t: r.props.name, lines: [r.props.kind || 'messaging'], cls: 'sk' }))] })
  const req = JSON.stringify(pj.cds?.requires || {}) + config.files(root, ['.cdsrc.json']).map(f => f.raw).join('')
  const dbs = []
  if (/hana/.test(req) || g.byType('DbArtifact').length || /@cap-js\/hana|@sap\/hana-client/.test(JSON.stringify(pj.dependencies || {}))) dbs.push({ id: 'db:hana', t: 'SAP HANA (HDI)', lines: [`${g.byType('DbArtifact').length} native artifacts`] })
  if (/sqlite/.test(req + JSON.stringify(pj.devDependencies || {}) + JSON.stringify(pj.dependencies || {}))) dbs.push({ id: 'db:sqlite', t: 'SQLite', lines: ['local dev + tests'], cls: 'sk' })
  const L = layout(root)
  const seeds = L.seedDirs.flatMap(d => walk(d, p => p.endsWith('.csv'))).length
  zones.push({ label: `PERSISTENCE${has('mta.yaml') ? ' · mta.yaml' : ''}`, boxes: [{ id: 'model', t: `CDS model ${L.db}/`, lines: [`${g.byType('Entity').filter(n => !n.id.endsWith('.texts')).length} entities · ${seeds} CSV seeds`], cls: 'sk' }, ...dbs] })
  const links = []
  for (const a of apps) for (const e of g.out(a.id, 'uses')) if (g.nodes.get(e.to)?.type === 'Service') links.push([a.id, e.to, 'OData V' + String(e.props.odataVersion || '4').split('.')[0]])
  for (const s of svcs) { for (const e of g.out(s.id, 'implemented_in')) links.push([s.id, e.to, '']); if (!g.out(s.id, 'implemented_in').length) links.push([s.id, 'generic:' + s.id, '']) }
  for (const b of zones[2].boxes.filter(b => b.cls === 'ac' || b.id.startsWith('generic:'))) links.push([b.id, dbs[0]?.id || 'model', ''])
  // layer stack
  const lint = g.byType('Finding')
  const appCds = g.byType('CdsFile').filter(f => f.props.layer === 'app')
  const bad = g.edges.filter(e => ['annotates', 'extends', 'uses'].includes(e.rel) && e.props.verdict === 'bad')
  const hs = g.byType('Handler'), ents = g.byType('Entity').filter(n => !n.id.endsWith('.texts'))
  const ui = g.byType('UiRule')
  const ex = g.byType('ServiceEntity').filter(n => !n.props.generated && !n.id.endsWith('.texts'))
  const openPii = ex.filter(n => piiFields(n).length && !g.out(n.id, 'requires').length && !g.out(`service:${n.props.service}`, 'requires').length)
  const n = (v, w) => `${v} ${w}`
  const ARC_LAYERS = [
    ['UI', `${L.app}/*/webapp`, [n(apps.length, 'UI5 apps'), n(g.byType('Route').length, 'routes'), n(g.byType('View').length, 'extension views'), n(g.byType('ExistingTest').filter(t => t.props.kind === 'ui-opa5').length, 'OPA journeys')],
      [lint.filter(f => f.props.severity === 'error').length && `cr:${lint.filter(f => f.props.severity === 'error').length} UI5 lint errors`, lint.filter(f => f.props.severity !== 'error').length && `wn:${lint.filter(f => f.props.severity !== 'error').length} UI5 lint warnings`].filter(Boolean)],
    ['Annotations', `${L.app}/**/*.cds · ${appCds.reduce((a, f) => a + f.props.lines, 0).toLocaleString('en')} lines`, appCds.sort((a, b) => b.props.lines - a.props.lines).slice(0, 6).map(f => `${base(f.props.path).replace('.cds', '')} ${f.props.lines}`),
      uniq(bad.filter(e => e.from.startsWith(`cdsfile:${L.app}/`)).map(e => `cr:${e.props.why}`))],
    ['Services', `${L.srv}/*.cds`, [...svcs.map(s => short(s.id)), n(ex.length, 'entity sets'), n(g.byType('Action').length, 'actions')],
      [...openPii.map(x => `cr:${short(x.id)} PII open`), ...g.byType('Action').filter(a => !g.in(a.id, 'handles').length).map(a => `wn:${a.props.name} w/o code`)].slice(0, 4)],
    ['Logic', uniq(hs.map(h => h.props.file)).join(', ') || 'none', [`ac:${hs.length} handlers`, n(g.byType('Rule').length, 'rules'), n(g.byType('Helper').length, 'helpers')],
      [ui.filter(r => r.props.verdict === 'ui-only').length && `wn:${ui.filter(r => r.props.verdict === 'ui-only').length} UI-only rules`, ui.filter(r => r.props.verdict === 'partial').length && `wn:${ui.filter(r => r.props.verdict === 'partial').length} partial`].filter(Boolean)],
    ['Domain', `${L.db}/*.cds`, Object.entries({ tx: 'draft documents', md: 'master data', cl: 'code lists', cm: 'common' }).map(([k, l]) => n(ents.filter(e => (e.props.codeList ? 'cl' : e.props.name.startsWith('sap.common.') ? 'cm' : e.props.draft || g.edges.some(x => x.rel === 'projects_on' && x.to === e.id && g.nodes.get(x.from)?.props.draft) ? 'tx' : 'md') === k).length, l)).filter(x => !x.startsWith('0 ')),
      uniq(ents.filter(e => piiFields(e).length).map(e => `${openPii.some(x => x.props.projectsOn === e.props.name) ? 'cr' : 'gd'}:${short(e.id)} PII`))],
    ['Persistence', `${L.db}/data` + (g.byType('DbArtifact').length ? ` · ${path.relative(root, L.hdiDir)} (HDI)` : ''), [...dbs.map(d => d.t), n(seeds, 'CSV seeds')], []],
    ['Platform', [has('mta.yaml') && 'mta.yaml', has('xs-security.json') && 'xs-security.json', has('app/router/xs-app.json') && 'approuter'].filter(Boolean).join(' · ') || 'none found',
      [xs && `XSUAA ${(xs.scopes || []).length} scopes`, ...(metrics.auth?.kinds || [])].filter(Boolean), []]
  ]
  return { ARC: { zones, links }, ARC_LAYERS }
}

module.exports = { arc }
