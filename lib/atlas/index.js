// Step 11 · Atlas facts: builds every atlas section from a discovery run. One builder per section in
// sections/<code>.js; each reads only the graph, the compiled CSN and files in the app, so the output is
// deterministic for a commit. Agent or human findings (risks, notes) come in through the curated base and
// are marked as such. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const fs = require('fs')
const path = require('path')
const { matrix } = require('../analyse/authz')
const { design } = require('../analyse/test-design')
const { detectPatterns } = require('../analyse/patterns')
const { detectRisks } = require('../analyse/risks')
const { uis } = require('./sections/uis')
const { api } = require('./sections/api')
const { dat } = require('./sections/dat')
const { dep } = require('./sections/dep')
const { flw } = require('./sections/flw')
const { sta } = require('./sections/sta')
const { aut } = require('./sections/aut')
const { arc } = require('./sections/arc')
const { tst } = require('./sections/tst')
const { uniq } = require('./util')

// ---------- all ----------
function buildAtlas({ g, csn, root, metrics, curated = {} }) {
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const meta = { restrictAll: metrics.auth?.restrictAll, root }
  const auth = matrix(g, meta)
  const td = design(g, root, meta)
  const D = {}
  Object.assign(D, arc(g, root, metrics), dat(g, root), dep(g), flw(g), sta(g, root, csn, td.TR), aut(g, auth), uis(g), tst(g, td))
  D.API = api(g)
  D.PATTERNS = detectPatterns(root, g, csn)
  D.LAYERS = [['ui', 'UI5 apps'], ['ann', 'Annotations'], ['srv', 'Services'], ['node', 'Node logic'], ['db', 'Domain / DB'], ['cfg', 'Config / tests']]
  const gen = detectRisks(g, meta)
  // agent findings: kept unless a rule now finds the same thing (curated risk.gen names the rule key)
  const keys = new Set(gen.map(r => r.key))
  const agent = (curated.RISKS || []).filter(r => !(r.gen && [].concat(r.gen).some(k => keys.has(k)))).map(r => ({ ...r, src: 'agent' }))
  D.RISKS = [...gen, ...agent]
  const sources = Object.fromEntries(['ARC', 'DAT', 'DEP', 'FLW', 'STA', 'AUT', 'PAT', 'UIS', 'TST', 'API'].map(k => [k, 'generated']))
  sources.RSK = agent.length ? 'generated + agent' : 'generated'

  const ui = D.PARITY.filter(p => p[3] === 'ui-only').length
  const ok = D.PARITY.filter(p => ['enforced', 'consistent', 'framework'].includes(p[3])).length
  const part = D.PARITY.filter(p => ['partial', 'stricter'].includes(p[3])).length
  const bad = D.DEPS.filter(d => d[2] === 'bad').length
  const cls = D.TESTCATS.reduce((a, c) => a + c.cls, 0), cov = D.TESTCATS.reduce((a, c) => a + c.cov, 0)
  const sets = D.API.reduce((a, s) => a + s.sets.length, 0), open = D.API.reduce((a, s) => a + s.sets.filter(x => x[2] === 'open').length, 0)
  const hs = g.byType('Handler').length
  const apps = g.byType('UI5App'), svcs = g.byType('Service')
  const openPii = D.API.some(s => s.sets.some(x => x[2] === 'open' && x[3].includes('PII')))
  const top = [...D.RISKS].sort((a, b) => b.i * b.l - a.i * a.l)[0]
  D.KPIS = [[String(apps.length), 'UI5 apps'], [String(svcs.length), 'OData services'], [String(D.ENT.length), 'entities'], [String(hs), 'Node handlers'], [String(D.PATTERNS.length), 'coding patterns'],
    [String(bad), 'layer violations', bad ? 'w' : ''], [`${ui} / ${D.PARITY.length}`, 'UI rules the server skips', ui ? 'c' : ''], [String(D.RISKS.length), 'risks with evidence', 'c'], [String(cls), 'equivalence classes'], [String(cov), 'covered today', 'w']]
  const S = []
  const sec = (code, name, take, views) => S.push({ code, name, take, views: views.filter(Boolean).map(([k, label]) => ({ k, label })) })
  sec('ARC', 'Architecture', `${apps.length} UI5 app${apps.length === 1 ? '' : 's'} on ${svcs.length} OData service${svcs.length === 1 ? '' : 's'}, served by one CAP Node.js process with ${hs} handlers.${ui ? ` <b>${ui} business rules are promised by UI annotations only</b>, not enforced by the server.` : ''}`, [['A', 'Container map'], ['B', 'Layer stack']])
  sec('DAT', 'Data model', `${D.ENT.length} entities: ${D.ENT.filter(e => e[1] === 'tx').length} in draft documents, ${D.ENT.filter(e => e[1] === 'md').length} master data, ${D.ENT.filter(e => e[1] === 'cl').length} code lists.${D.ENT.some(e => e[4]) ? ` Personal data in <b>${D.ENT.filter(e => e[4]).map(e => e[0]).join(', ')}</b>.` : ''}`, [['A', 'Composition tree'], ['B', 'Force graph'], ['C', 'Entity matrix']])
  sec('DEP', 'Dependencies', `${D.FILES.length} CDS files, ${D.DEPS.length} file-to-file dependencies. ${bad ? `<b>${bad} reach past their layer</b>` : 'No layer violations'}${D.DEPS.some(d => d[2] === 'skip') ? `, ${D.DEPS.filter(d => d[2] === 'skip').length} put UI annotations straight on the domain` : ''}.`, [['A', 'Layered graph'], ['B', 'Dependency matrix']])
  sec('FLW', 'Data flow & events', `${D.SANKEY_LINKS.length ? `${uniq(D.SANKEY_NODES.filter(n => n.includes(': '))).length} entities get fields written by handlers` : 'No handler writes fields'}${D.SWIM ? `; the busiest handler is <b>${D.SWIM.title}</b> (${D.SWIM.ev})` : ''}. ${D.HOOK_EVENTS.length} lifecycle events carry server or UI hooks.`,
    [D.SANKEY_LINKS.length && ['A', 'Sankey'], D.SWIM && ['B', 'Swimlane: ' + D.SWIM.title], ['C', 'Hook timeline']])
  if (D.STATES) sec('STA', `${D.STATES.field} lifecycle`, `${D.STATES.codes.length} states, ${D.TR.length} action × state pairs. The UI allows ${D.TR.filter(t => t.ui).length}, the Node server ${D.TR.filter(t => t.node).length}; <b>${D.TR.filter(t => t.ui !== t.node).length} disagree</b>.`, [['A', 'State machine'], ['B', 'Transition table']])
  sec('AUT', 'Authorization', `${D.ROLES.length} users (anonymous plus mock users) × ${D.AUTH.length} operations. ${D.AUTH.filter(a => a.c.some(c => (c.v || c) === 'r')).length ? `<b>${D.AUTH.filter(a => a.c.some(c => (c.v || c) === 'r')).length} operations expose personal data without a role.</b>` : 'No personal data is open.'} ${D.AUTH.reduce((a, r) => a + r.c.filter(c => c.t).length, 0)} cells are exercised by existing tests.`, [['A', 'Role heatmap'], D.PIIREACH.endpoints.length && ['B', 'PII reach'], D.CHAIN.roles.length && ['C', 'Role chain']])
  sec('PAT', 'Coding patterns', `${D.PATTERNS.length} patterns found by fixed detectors. ${D.PATTERNS.filter(p => p.h === 'cr').length} cause a defect or exposure, ${D.PATTERNS.filter(p => p.h === 'wn').length} work but sit in the wrong place.`, [['A', 'Pattern cards'], ['B', 'Pattern × layer']])
  if (D.PARITY.length) sec('UIS', 'UI promises vs server', `${D.PARITY.length} rules the UI promises, read from the annotations. ${ok} are enforced by the server or by CAP, ${part} only partly${ui ? `; <b>${ui} exist only in the UI</b> and can be bypassed with a plain OData call` : ''}.`, [['A', 'Reflexion matrix'], ['B', 'Verdict bars']])
  sec('RSK', 'Risks', `${D.RISKS.length} risks: ${gen.length} found by rules, ${agent.length} by agent review. Highest: <b>${top ? top.t : 'none'}</b>${top ? ` (score ${top.i * top.l})` : ''}.`, [['A', 'Impact × likelihood'], ['B', 'Ranked cards']])
  sec('TST', 'Test design', `${cls} equivalence classes in ${D.TESTCATS.length} categories; <b>${cov} covered by existing tests</b>.${D.DD ? ` ${D.DD.action}: ${D.DD.rows.length} all-pairs cases instead of ${D.DD.full}.` : ''}`, [['A', 'Coverage treemap'], D.DD && ['B', `${D.DD.action} classes`], ['C', 'Coverage bars']])
  sec('API', 'Interfaces', `${D.API.length} service roots, ${sets} entity sets, ${D.API.reduce((a, s) => a + s.acts.length, 0)} actions. <b>${open} sets need no role</b>${openPii ? ', including personal data' : ''}.`, [['A', 'Endpoint map'], ['B', 'Interface list']])
  D.SECTIONS = S
  const name = (curated.META?.title) || `${String(pj.name || path.basename(root)).replace(/^@[^/]+\//, '').replace(/^./, c => c.toUpperCase())} Discovery Atlas`
  const repo = typeof pj.repository === 'string' ? pj.repository : pj.repository?.url
  const lede = `${apps.length} UI5 app${apps.length === 1 ? '' : 's'} (${apps.filter(a => a.props.fioriElements).length} Fiori elements), ${svcs.length} OData services, ${D.ENT.length} entities and a CAP Node.js backend with ${hs} handlers, read end to end from the code.`
  D.META = { title: name, app: curated.META?.app || pj.name, url: curated.META?.url || (repo || '').replace(/^git\+/, '').replace(/\.git$/, ''), license: curated.META?.license || pj.license || 'unknown', scope: 'CAP Node.js only', run: String(metrics.run).slice(0, 10), commit: metrics.commit,
    lede: curated.META?.lede ? curated.META.lede : lede, sources }
  return { D, td }
}

module.exports = { buildAtlas }
