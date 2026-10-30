// Coding-pattern detectors over the CSN, the graph and the sources. Each detector is a fixed rule,
// so two runs on the same commit give the same list. A pattern is
//   { n name, w where, ev file:line, k uses, h health gd|wn|cr, x note when not idiomatic, L layers }
// Layers: ui (UI5 apps), ann (UI annotations), srv (service CDS), node (handlers), db (domain), cfg (config).
const fs = require('fs')
const path = require('path')
const { walk } = require('./extract-handlers')
const { locator } = require('./reflexion-ui')
const { piiFields } = require('./authz')

const short = id => String(id).replace(/^[a-z]+:/, '').split('.').pop()

function detectPatterns(root, g, csn) {
  const defs = csn.definitions
  const own = Object.entries(defs).filter(([, d]) => d.$location && !/node_modules/.test(d.$location.file))
  const ents = own.filter(([n, d]) => d.kind === 'entity' && !n.endsWith('.texts'))
  const dbEnts = ents.filter(([n]) => !Object.keys(defs).some(s => defs[s].kind === 'service' && n.startsWith(s + '.')))
  const find = locator(root)
  const at = d => d.$location ? `${path.normalize(d.$location.file)}:${d.$location.line}` : null
  const out = []
  const add = (p) => { if (p.k > 0) out.push({ h: 'gd', ...p }) }
  const includes = (d, a) => (d.includes || []).some(i => i === a || i.endsWith('.' + a))
  const annCount = re => { let c = 0; for (const [, d] of own) { for (const k of Object.keys(d)) if (re.test(k)) c++; for (const e of Object.values(d.elements || {})) for (const k of Object.keys(e)) if (re.test(k)) c++ } return c }

  // --- domain model ---
  const drafts = g.byType('ServiceEntity').filter(n => n.props.draft)
  for (const d of drafts) {
    const chain = [], walkC = (id, depth) => { if (depth > 4) return; for (const e of g.out(id, 'composes')) { const t = g.nodes.get(e.to); if (t && !t.id.endsWith('.texts')) { chain.push(short(t.id)); walkC(t.id, depth + 1) } } }
    walkC(d.id, 0)
    add({ n: chain.length ? 'Draft root with compositions' : 'Draft-enabled entity', w: [short(d.id), ...chain].join(' ▸ '), ev: d.evidence, k: 1 + chain.length, L: ['ann', 'srv', 'node'] })
  }
  const auto = dbEnts.filter(([, d]) => d['@cds.autoexpose'])
  const autoPii = auto.filter(([n]) => { const e = g.nodes.get(`entity:${n}`); return e && piiFields(e).length })
  add({ n: 'Auto-exposed master data', w: `@cds.autoexpose on ${auto.length} entities`, ev: auto[0] && (find('@cds.autoexpose') || at(auto[0][1])), k: auto.length,
    ...(autoPii.length ? { h: 'cr', x: `also exposes personal data (${autoPii.map(([n]) => short(n)).join(', ')})` } : {}), L: ['db'] })
  for (const a of ['cuid', 'managed', 'temporal']) { const hit = dbEnts.filter(([, d]) => includes(d, a)); add({ n: `Aspect ${a}`, w: hit.map(([n]) => short(n)).slice(0, 4).join(', ') + (hit.length > 4 ? ', …' : ''), ev: hit[0] && at(hit[0][1]), k: hit.length, L: ['db'] }) }
  const codeLists = dbEnts.filter(([, d]) => includes(d, 'CodeList'))
  add({ n: 'Code lists (sap.common.CodeList)', w: codeLists.map(([n]) => short(n)).join(', '), ev: codeLists[0] && at(codeLists[0][1]), k: codeLists.length, L: ['db'] })
  const texts = Object.keys(defs).filter(n => n.endsWith('.texts') && !Object.keys(defs).some(s => defs[s].kind === 'service' && n.startsWith(s + '.')) && defs[n].$location && !/node_modules/.test(defs[n].$location.file))
  add({ n: 'Localized texts', w: texts.map(n => short(n.replace(/\.texts$/, ''))).join(', '), ev: texts[0] && at(defs[texts[0]]), k: texts.length, L: ['db'] })
  const enums = [...new Set(ents.flatMap(([n, d]) => Object.entries(d.elements || {}).filter(([, e]) => e.enum).map(([en]) => `${short(n)}.${en}`)))]
  add({ n: 'Enum types on elements', w: enums.slice(0, 4).join(', '), ev: find(' enum '), k: enums.length, L: ['db'] })

  // --- services ---
  const services = g.byType('Service')
  const projections = g.byType('ServiceEntity').filter(n => !n.props.autoexposed && !n.props.generated)
  add({ n: 'Service projections on the domain', w: `${projections.length} entity sets in ${services.length} services`, ev: services[0]?.evidence, k: projections.length, L: ['srv'] })
  const grants = g.edges.filter(e => e.rel === 'requires')
  const openSvcs = services.filter(s => !g.out(s.id, 'requires').length && !g.out(s.id, 'exposes').some(e => g.out(e.to, 'requires').length))
  add({ n: 'Declarative authorization (@requires / @restrict)', w: `${grants.length} grants on ${new Set(grants.map(e => e.from)).size} targets`, ev: grants[0]?.evidence, k: grants.length,
    ...(openSvcs.length ? { h: 'wn', x: `${openSvcs.map(s => short(s.id)).join(', ')} without any grant` } : {}), L: ['srv'] })
  const ro = g.byType('ServiceEntity').filter(n => n.props.readonly && !n.props.autoexposed)
  add({ n: '@readonly service entities', w: ro.map(n => short(n.id)).slice(0, 4).join(', '), ev: ro[0]?.evidence, k: ro.length, L: ['srv'] })
  const acts = g.byType('Action'), noImpl = acts.filter(a => !g.in(a.id, 'handles').length)
  add({ n: 'Bound actions', w: acts.map(a => a.props.name).join(', '), ev: acts[0]?.evidence, k: acts.length, ...(noImpl.length ? { h: 'wn', x: `${noImpl.map(a => a.props.name).join(', ')} has no handler` } : {}), L: ['srv', 'node'] })
  const agg = annCount(/^@(Aggregation|Analytics)\./)
  add({ n: 'Analytical annotations', w: '@Aggregation / @Analytics', ev: find('@Aggregation') || find('@Analytics'), k: agg, L: ['ann', 'srv'] })

  // --- UI annotations ---
  const vh = annCount(/^@Common\.ValueList/)
  add({ n: 'Value helps', w: '@Common.ValueList', ev: find('ValueList'), k: vh, L: ['ann'] })
  const li = annCount(/^@UI\.(LineItem|Facets|HeaderInfo|SelectionFields)/)
  add({ n: 'Fiori elements layout annotations', w: '@UI.LineItem / Facets / HeaderInfo', ev: find('LineItem'), k: li, L: ['ann'] })
  const ui = g.byType('UiRule')
  const sideFx = ui.filter(r => r.props.kind === 'side-effects')
  add({ n: 'SideEffects re-read after a change', w: [...new Set(sideFx.map(r => short(r.props.entity)))].join(', '), ev: sideFx[0]?.evidence, k: sideFx.length, L: ['ann', 'node'] })
  const stateUi = ui.filter(r => ['operation-available', 'field-control', 'CreateHidden', 'DeleteHidden'].includes(r.props.kind))
  const uiOnly = stateUi.filter(r => r.props.verdict === 'ui-only')
  add({ n: 'State rules in UI annotations', w: 'OperationAvailable · FieldControl · Create/DeleteHidden', ev: stateUi[0]?.evidence, k: stateUi.length,
    ...(uiOnly.length ? { h: 'wn', x: `${uiOnly.length} not enforced by the server` } : {}), L: ['ann'] })
  const label = annCount(/^@(title|Common\.Label|description)$/)
  add({ n: 'Labels and titles in CDS', w: '@title / @Common.Label', ev: find('@title') || find('Common.Label'), k: label, L: ['ann', 'db'] })

  // --- CDS file layering ---
  const deps = g.edges.filter(e => ['annotates', 'extends'].includes(e.rel))
  const bad = deps.filter(e => e.props.verdict === 'bad'), skip = deps.filter(e => e.props.verdict === 'skip')
  add({ n: 'Annotations placed outside their layer', w: [...new Set(bad.map(e => e.props.why))].join('; '), ev: bad[0]?.evidence, k: bad.length, h: 'cr', x: 'changes a model another layer owns', L: ['ann', 'db'] })
  add({ n: 'UI annotations directly on domain entities', w: `${new Set(skip.map(e => e.props.target)).size} domain entities annotated from app/`, ev: skip[0]?.evidence, k: skip.length, h: 'wn', x: 'bypasses the service layer', L: ['ann', 'db'] })

  // --- Node handlers ---
  const hs = g.byType('Handler')
  const files = [...new Set(hs.map(h => h.props.file))]
  const srcs = files.map(f => [f, fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : ''])
  const cls = srcs.filter(([, s]) => /extends\s+cds\.ApplicationService/.test(s))
  add({ n: 'Class-based service (extends cds.ApplicationService)', w: cls.map(([f]) => f).join(', '), ev: cls[0] && `${cls[0][0]}:${cls[0][1].split('\n').findIndex(l => /extends\s+cds\.ApplicationService/.test(l)) + 1}`, k: cls.length, L: ['node'] })
  const fn = srcs.filter(([, s]) => /cds\.service\.impl|module\.exports\s*=\s*(async\s*)?(function|\()/.test(s) && !/extends\s+cds\.ApplicationService/.test(s))
  add({ n: 'Function-style service impl', w: fn.map(([f]) => f).join(', '), ev: fn[0] && `${fn[0][0]}:1`, k: fn.length, L: ['node'] })
  for (const ph of ['before', 'on', 'after']) { const x = hs.filter(h => h.props.phase === ph); add({ n: `${ph}-handlers`, w: [...new Set(x.flatMap(h => h.props.events))].slice(0, 5).join(', '), ev: x[0]?.evidence, k: x.length, L: ['node'] }) }
  const draftH = hs.filter(h => h.props.drafts)
  add({ n: 'Handlers on draft tables', w: [...new Set(draftH.map(h => short(h.props.target)))].join(', '), ev: draftH[0]?.evidence, k: draftH.length, L: ['node'] })
  const typer = srcs.filter(([, s]) => /#cds-models/.test(s))
  add({ n: 'cds-typer generated types', w: '#cds-models imports', ev: typer[0] && `${typer[0][0]}:${typer[0][1].split('\n').findIndex(l => l.includes('#cds-models')) + 1}`, k: typer.length, L: ['node'] })
  const helpers = g.byType('Helper')
  add({ n: 'Shared helper called from handlers', w: helpers.map(h => h.props.name).join(', '), ev: helpers[0]?.evidence, k: g.edges.filter(e => e.rel === 'calls').length, L: ['node'] })
  const rawSql = g.edges.filter(e => ['writes', 'reads'].includes(e.rel) && String(e.props.via).startsWith('cds.run'))
  add({ n: 'Raw SQL via cds.run', w: [...new Set(rawSql.map(e => short(e.to)))].join(', '), ev: rawSql[0]?.evidence, k: rawSql.length, h: 'wn', x: 'bypasses CQL and draft handling; check projections', L: ['node'] })
  const rej = g.byType('Rule').filter(r => r.props.kind === 'rejection')
  add({ n: 'Validation with req.reject / req.error', w: rej.map(r => r.props.status || 400).join(', '), ev: rej[0]?.evidence, k: rej.length, L: ['node'] })
  const der = g.byType('Rule').filter(r => r.props.kind === 'derivation')
  add({ n: 'Derived fields set in before-handlers', w: [...new Set(der.map(r => r.props.field))].join(', '), ev: der[0]?.evidence, k: der.length, L: ['node'] })

  // --- UI5 / config / tests ---
  const apps = g.byType('UI5App'), fe = apps.filter(a => a.props.fioriElements)
  add({ n: 'Fiori elements apps', w: fe.map(a => a.props.id.split('.').pop()).join(', '), ev: fe[0]?.evidence, k: fe.length, L: ['ui'] })
  const freestyle = apps.filter(a => !a.props.fioriElements)
  add({ n: 'Freestyle UI5 apps', w: freestyle.map(a => a.props.id.split('.').pop()).join(', '), ev: freestyle[0]?.evidence, k: freestyle.length, L: ['ui'] })
  const views = g.byType('View')
  add({ n: 'UI extensions (fragments, controller ext)', w: views.map(v => path.basename(v.props.file)).slice(0, 3).join(', '), ev: views[0]?.evidence, k: views.length, L: ['ui'] })
  const csv = ['db/data', 'db/csv', 'test/data'].flatMap(d => walk(path.join(root, d), p => p.endsWith('.csv')))
  add({ n: 'CSV seed data', w: [...new Set(csv.map(f => path.relative(root, path.dirname(f))))].join(', '), ev: csv[0] && `${path.relative(root, csv[0])}:1`, k: csv.length, L: ['db', 'cfg'] })
  const tests = g.byType('ExistingTest')
  const svcT = tests.filter(t => t.props.kind === 'service'), opa = tests.filter(t => t.props.kind === 'ui-opa5')
  add({ n: 'Service tests (cds.test)', w: svcT.map(t => t.props.file).join(', '), ev: svcT[0]?.evidence, k: svcT.reduce((a, t) => a + t.props.cases, 0),
    ...(svcT.length && new Set(svcT.flatMap(t => t.props.runsAs)).size <= 1 ? { h: 'wn', x: `all as ${svcT.flatMap(t => t.props.runsAs)[0] || 'one user'}` } : {}), L: ['node', 'cfg'] })
  add({ n: 'OPA5 journeys', w: opa.map(t => t.props.file.split('/')[1]).join(', '), ev: opa[0]?.evidence, k: opa.reduce((a, t) => a + t.props.cases, 0), L: ['ui'] })
  const remotes = g.byType('ExternalService').filter(r => !r.props.name.startsWith('/')), msg = g.byType('MessagingBroker')
  add({ n: 'Remote services (cds.requires)', w: remotes.map(r => r.props.name).join(', '), ev: remotes[0]?.evidence, k: remotes.length, L: ['cfg', 'node'] })
  const imported = remotes.filter(r => r.props.imported)
  add({ n: 'Imported APIs (cds import, @cds.external)', w: imported.map(r => r.props.name).slice(0, 4).join(', ') + (imported.length > 4 ? ', …' : ''), ev: imported[0]?.evidence, k: imported.length, L: ['srv', 'cfg'] })
  add({ n: 'Messaging / events', w: msg.map(r => r.props.name).join(', '), ev: msg[0]?.evidence, k: msg.length, L: ['cfg', 'node'] })

  // --- integration: other services, events, remote calls ---
  const foreignH = hs.filter(h => h.props.registeredFrom)
  add({ n: 'Handlers registered on another service (cds.connect.to + on/before)', w: [...new Set(foreignH.map(h => `${short(h.props.service)} from ${h.props.file}`))].join(', '), ev: foreignH[0]?.evidence, k: foreignH.length, L: ['node'] })
  const subs = g.edges.filter(e => e.rel === 'subscribes')
  add({ n: 'Event subscriptions to other services', w: subs.map(e => g.nodes.get(e.to)?.props.name).join(', '), ev: subs[0]?.evidence, k: subs.length, L: ['node'] })
  const emits = g.edges.filter(e => e.rel === 'emits')
  add({ n: 'Events emitted (srv.emit)', w: [...new Set(emits.map(e => g.nodes.get(e.to)?.props.name))].join(', '), ev: emits[0]?.evidence, k: emits.length, L: ['node'] })
  const calls = g.edges.filter(e => e.rel === 'calls_service' && e.from.startsWith('handler:'))
  const fileCalls = g.edges.filter(e => e.rel === 'calls_service' && e.from.startsWith('file:') && !calls.some(c => c.evidence === e.evidence))
  add({ n: 'Calls to other or remote services', w: [...new Set(calls.concat(fileCalls).map(e => `${short(e.to)}.${e.props.via}`))].slice(0, 5).join(', '), ev: (calls[0] || fileCalls[0])?.evidence, k: calls.length + fileCalls.length, L: ['node'] })
  const split = g.byType('Service').filter(s => g.out(s.id, 'implemented_in').length > 2)
  add({ n: 'Service implementation split over files', w: split.map(s => `${short(s.id)} (${g.out(s.id, 'implemented_in').length} files)`).join(', '), ev: split[0] && g.out(split[0].id, 'implemented_in')[0]?.evidence, k: split.length, L: ['node'] })

  // --- HANA-native / database specific ---
  const arts = g.byType('DbArtifact')
  add({ n: 'HANA-native artifacts (HDI, db/src)', w: [...new Set(arts.map(a => a.props.kind))].join(', '), ev: arts[0]?.evidence, k: arts.length, L: ['db'] })
  const exists = g.byType('Entity').filter(e => e.props.persistenceExists)
  add({ n: 'Entities on native objects (@cds.persistence.exists)', w: exists.map(e => short(e.id)).join(', '), ev: exists[0]?.evidence, k: exists.length, h: 'wn', x: 'no table on SQLite: local tests cannot read them', L: ['db'] })
  const nsql = g.byType('SourceFile').flatMap(f => (f.props.nativeSql || []).map(q => ({ ...q, f: f.props.path }))).filter(q => !rawSql.some(e => e.evidence === `${q.f}:${q.line}`)) // cds.run(`UPDATE ${Entity} ...`) is counted above
  add({ n: 'Native SQL strings (db.run / cds.run)', w: [...new Set(nsql.map(q => q.f))].join(', '), ev: nsql[0] && `${nsql[0].f}:${nsql[0].line}`, k: nsql.length, ...(nsql.some(q => q.hanaOnly) ? { h: 'wn', x: `${nsql.filter(q => q.hanaOnly).length} only run on HANA` } : {}), L: ['node', 'db'] })
  const br = g.byType('SourceFile').filter(f => f.props.dbBranches?.length)
  add({ n: 'Code branches on the database kind', w: br.map(f => f.props.path).join(', '), ev: br[0] && `${br[0].props.path}:${br[0].props.dbBranches[0].line}`, k: br.reduce((a, f) => a + f.props.dbBranches.length, 0), h: 'wn', x: 'tests on SQLite reach one branch only', L: ['node', 'db'] })
  const variants = g.byType('DbVariant')
  add({ n: 'Database model per profile', w: variants.map(v => `${v.props.profile}: ${v.props.model.join(', ')}`).join(' · '), ev: variants[0]?.evidence, k: variants.length > 1 ? variants.length : 0, L: ['db', 'cfg'] })
  return out.filter(p => p.ev)
}

module.exports = { detectPatterns }
