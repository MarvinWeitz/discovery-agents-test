// Static collectors: turn what the pipeline already decided (graph, risks, patterns, UI promises,
// authorization, test design, slices, the probe's errors) into findings, and name every question it
// could not settle as a gap with who can settle it. No new analysis happens here: each collector reads
// the same functions the atlas uses, so findings and atlas cannot disagree.
// Walkthrough: docs/walkthrough/13-findings-and-gaps.md
const path = require('path')
const { matrix, short } = require('../analyse/authz')
const { design } = require('../analyse/test-design')
const { detectPatterns } = require('../analyse/patterns')
const { detectRisks } = require('../analyse/risks')
const { QUESTIONS } = require('../../bin/brief-questions')
const { ev, level, clip } = require('./book')

const LAYER = { ui: 'UI', ann: 'Annotations', srv: 'Service', node: 'Node', db: 'DB', cfg: 'Config' }
const HEALTH = { cr: 'critical', wn: 'warning', gd: 'good' }
const VERDICT = {
  enforced: 'the server enforces it', consistent: 'the server does the same', framework: 'CAP enforces it generically',
  stricter: 'the server is stricter', partial: 'the server enforces it only in part', 'ui-only': 'only the UI enforces it',
  dynamic: 'the server compares it with a computed value', unknown: 'the handler body is not readable', unimplemented: 'no handler implements the action',
}
// draft actions CAP implements itself
const GENERIC_ACTIONS = new Set(['draftEdit', 'draftActivate', 'draftPrepare', 'draftDiscard', 'draftNew'])

// files that implement a service (to look for an enforcement the parser missed)
const implFiles = (g, svc) => g.out(`service:${svc}`, 'implemented_in').map(e => e.to.replace(/^file:/, ''))

function risks(B, { g, meta, D }) {
  const atlasIds = new Map((D?.RISKS || []).map(r => [r.key, r.id]))
  for (const r of detectRisks(g, meta)) {
    B.finding({
      kind: 'risk', key: r.key, title: r.t, statement: r.d, source: `lib/analyse/risks.js#${String(r.key).split(':')[0]}`,
      severity: { level: level(r.i, r.l), impact: r.i, likelihood: r.l }, layer: r.lay, evidence: [r.ev], test: r.test,
      data: { key: r.key, ...(atlasIds.get(r.key) ? { atlasId: atlasIds.get(r.key) } : {}) },
    })
  }
  // reviewed agent findings from the curated base (--base): a person merged them, so method "human"
  for (const r of (D?.RISKS || []).filter(r => r.src === 'agent')) {
    B.finding({
      kind: 'agent-risk', key: `${r.id}|${r.ev}`, title: r.t, statement: r.d, method: 'human', source: `curated:${r.reviewer || 'agent'}`, status: 'confirmed', confidence: 'medium',
      severity: { level: level(r.i, r.l), impact: r.i, likelihood: r.l }, layer: r.lay, evidence: [r.ev], test: r.test, data: { atlasId: r.id, origin: 'agent finding reviewed into curated/<app>.json' },
    })
  }
}

function patterns(B, { g, csn, root }) {
  for (const p of detectPatterns(root, g, csn)) {
    B.finding({
      kind: 'pattern', key: p.n, title: p.n, statement: [p.w, p.x].filter(Boolean).join('. ') + '.', source: 'lib/analyse/patterns.js',
      severity: { level: HEALTH[p.h] || 'info' }, layer: (p.L || []).map(l => LAYER[l] || l).join(', '), evidence: [p.ev], data: { count: p.k, layers: p.L },
    })
  }
}

function uiPromises(B, { g }) {
  for (const n of g.byType('UiRule')) {
    const p = n.props, what = p.action ? `${short(p.entity)}.${p.action}` : `${short(p.entity)}${p.fields ? ` (${p.fields.slice(0, 4).join(', ')}${p.fields.length > 4 ? ', …' : ''})` : ''}`
    const weak = ['ui-only', 'partial', 'dynamic', 'unknown'].includes(p.verdict)
    const checked = [...g.out(n.id, 'enforced_by'), ...g.out(n.id, 'checked_in')].map(e => e.evidence)
    const id = B.finding({
      kind: 'ui-promise', key: n.id, title: `${p.kind} on ${what}: ${p.verdict}`, statement: `The UI promises "${p.ui}"; ${VERDICT[p.verdict] || p.verdict}${p.server ? ` (${p.server})` : ''}.${p.sent === false ? ' The annotation does not reach the UI ($metadata).' : ''}`,
      source: 'lib/analyse/reflexion-ui.js', status: weak ? 'suspected' : 'detected', confidence: n.confidence,
      severity: { level: p.verdict === 'ui-only' ? 'warning' : weak || p.verdict === 'unimplemented' ? 'info' : 'good' }, layer: 'Annotations', evidence: [n.evidence, ...checked], subjects: [n.id, `svcentity:${p.entity}`],
      test: weak ? `Send the request the UI hides (${p.action ? `POST …/${p.action}` : 'PATCH/POST'} on ${short(p.entity)}) and expect a rejection.` : undefined,
      data: { verdict: p.verdict, ui: p.ui, server: p.server, entity: p.entity, action: p.action || null, fields: p.fields || null },
    })
    if (weak) B.gap({
      kind: 'enforcement-elsewhere', key: n.id, about: [id], subjects: [n.id], priority: p.verdict === 'ui-only' ? 'high' : 'medium', resolvableBy: ['measured', 'ai'],
      question: `Does anything on the server enforce "${p.ui}" for ${what}: another handler, a database constraint, a plugin, a reverse proxy?`,
      why: 'The handler parser found no check on this field or action. Code it cannot bind (dynamic registrations, plugins, helpers in packages) or a constraint outside CAP would not show up.',
      look: [n.evidence, ...implFiles(g, p.entity.split('.')[0]).map(f => ({ file: f, why: 'service implementation' }))],
      expects: 'the file:line that enforces it, or "none found" with the files read; a measured request settles it',
    })
  }
}

function authz(B, { g, meta }) {
  const A = matrix(g, meta)
  const word = { y: 'allowed', n: 'denied', r: 'open (personal data, no role)', a: 'unclear' }
  for (const r of A.rows) {
    const groups = {}
    r.c.forEach((c, i) => (groups[c.v] ||= []).push(A.users[i].id))
    const key = `${r.service}|${r.op}`
    const id = B.finding({
      kind: 'authz', key, title: `${r.service}: ${r.op}`, statement: Object.entries(groups).map(([v, us]) => `${word[v] || v} for ${us.join(', ')}`).join('; ') + '.',
      source: 'lib/analyse/authz.js', status: groups.a ? 'suspected' : 'detected', confidence: groups.a ? 'medium' : 'high',
      severity: { level: groups.r ? 'critical' : groups.a ? 'warning' : 'info' }, layer: 'Model', evidence: [r.ev], subjects: [r.entity && `svcentity:${r.entity}`],
      data: { service: r.service, entity: r.entity || null, token: r.token, users: A.users.map(u => u.id), cells: r.c.map(c => c.v), tested: r.c.map(c => !!c.t), note: r.note || null },
    })
    if (groups.a) B.gap({
      kind: 'authz-unclear', key, about: [id], subjects: [r.entity && `svcentity:${r.entity}`], priority: 'medium', resolvableBy: ['measured', 'ai'],
      question: `Is ${r.op} allowed for ${groups.a.join(', ')}?`,
      why: r.note || 'The outcome depends on inheritance (draft children) or a row-level where clause that only a request can show.',
      look: [r.ev], expects: 'the HTTP status per user; the measured addon sends exactly these requests in CI',
    })
  }
  return A
}

function layers(B, { g }) {
  for (const e of g.edges.filter(e => e.props?.verdict === 'bad')) {
    B.finding({
      kind: 'layer-violation', key: `${e.from}|${e.rel}|${e.to}|${e.props.target || ''}`, title: `${e.from.replace(/^cdsfile:/, '')} ${e.rel} ${e.props.target || e.to.replace(/^cdsfile:/, '')}`,
      statement: `${e.props.why || 'reaches past its layer'}.`, source: 'lib/extract/cds-deps.js', severity: { level: 'warning' }, layer: 'Annotations', evidence: [e.evidence], subjects: [e.from, e.to],
    })
  }
}

function lint(B, { g }) {
  for (const n of g.byType('Finding')) {
    const p = n.props
    B.finding({
      kind: 'lint', key: n.id, title: `${p.tool} ${p.rule}`, statement: p.message, source: `${p.tool}:${p.rule}`,
      severity: { level: p.severity === 'error' ? 'warning' : 'info' }, evidence: [n.evidence], subjects: g.out(n.id, 'on').map(e => e.to), data: { tool: p.tool, rule: p.rule, severity: p.severity },
    })
  }
}

function transitions(B, { td, D }) {
  const TR = D?.TR || td.TR || []
  for (const t of TR.filter(t => t.ui !== t.node)) {
    B.finding({
      kind: 'state-transition', key: `${t.a}|${t.f}|${t.t}`, title: `${t.a} in state ${t.f}: UI ${t.ui ? 'offers' : 'hides'} it, server ${t.node ? 'accepts' : 'rejects'}`,
      statement: `In state ${t.f}, ${t.a} (→ ${t.t}) is ${t.ui ? 'offered' : 'hidden'} by the UI and ${t.node ? 'accepted' : 'rejected'} by the Node server.`, source: 'lib/analyse/test-design.js (state machine)',
      severity: { level: t.node && !t.ui ? 'warning' : 'info' }, layer: 'Service', evidence: t.ev || [], data: { action: t.a, from: t.f, to: t.t, ui: !!t.ui, server: !!t.node },
    })
  }
}

function actions(B, { g }) {
  for (const a of g.byType('Action')) {
    if (GENERIC_ACTIONS.has(a.props.name) || g.in(a.id, 'handles').length) continue
    const svc = a.id.replace(/^action:/, '').split('.')[0]
    const id = B.finding({
      kind: 'action-without-handler', key: a.id, title: `${a.props.name}: no handler found`, statement: `${a.props.bound ? 'Bound' : 'Unbound'} ${a.props.kind} ${a.props.name} has no srv.on handler the parser can see; CAP answers 501 unless something registers one at runtime.`,
      source: 'lib/extract/handlers', status: 'suspected', confidence: 'medium', severity: { level: 'warning' }, layer: 'Service', evidence: [a.evidence], subjects: [a.id],
    })
    B.gap({
      kind: 'handler-missing', key: a.id, about: [id], subjects: [a.id], priority: 'medium', resolvableBy: ['measured', 'ai'],
      question: `Where is ${a.props.name} implemented, if anywhere (a plugin, a dynamic registration, a generic handler)?`,
      why: 'No srv.on registration for this name was found in the files CAP would load. Registrations built from strings, loops or packages are invisible to the parser.',
      look: [a.evidence, ...implFiles(g, svc).map(f => ({ file: f, why: 'service implementation' }))], expects: 'the file:line of the handler, or a request that shows 501',
    })
  }
}

function nativeSql(B, { g }) {
  for (const f of g.byType('SourceFile')) for (const q of f.props.nativeSql || []) {
    const key = `${f.props.path}|${q.sql.slice(0, 80)}`
    const id = B.finding({
      kind: 'native-sql', key, title: `${q.hanaOnly ? 'HANA-only ' : ''}SQL string in ${path.basename(f.props.path)}`, statement: `Runs "${clip(q.sql, 120)}" as a string, outside CQL; the parser does not read which entities it touches.`,
      source: 'lib/extract/handlers/file-scan.js', severity: { level: q.hanaOnly ? 'warning' : 'info' }, layer: 'Node', evidence: [`${f.props.path}:${q.line}`], subjects: [f.id], data: { sql: q.sql, hanaOnly: !!q.hanaOnly },
    })
    B.gap({
      kind: q.hanaOnly ? 'hana-only-path' : 'native-sql-effect', key, about: [id], subjects: [f.id], priority: q.hanaOnly ? 'medium' : 'low', resolvableBy: q.hanaOnly ? ['ai', 'human'] : ['ai'],
      question: q.hanaOnly ? `Which behaviour depends on this HANA-only SQL, and how is it tested without HANA?` : `Which entities and fields does this SQL read and write, and under which condition?`,
      why: q.hanaOnly ? 'The statement uses HANA-only syntax; the local test database (SQLite) cannot run it, so no generated test reaches it.' : 'SQL in a string is not parsed into reads and writes.',
      look: [`${f.props.path}:${q.line}`], expects: 'entities and fields with file:line, as findings',
    })
  }
}

function routes(B, { g }) {
  for (const r of g.byType('HttpRoute')) {
    const p = r.props
    const id = B.finding({
      kind: 'custom-route', key: `${p.method} ${p.path}|${p.file}`, title: `${p.method.toUpperCase()} ${p.path} (custom ${p.kind === 'static' ? 'static files' : 'express route'})`,
      statement: `${p.file} adds ${p.method.toUpperCase()} ${p.path} to the express app at bootstrap. CAP's @requires and @restrict do not apply to it.`,
      source: 'lib/extract/bootstrap.js', severity: { level: p.kind === 'static' ? 'info' : 'warning' }, layer: 'Node', evidence: [r.evidence], subjects: [r.id], data: { method: p.method, path: p.path, kind: p.kind },
    })
    if (p.kind !== 'static') B.gap({
      kind: 'custom-route-behaviour', key: r.id, about: [id], subjects: [r.id], priority: 'medium', resolvableBy: ['ai', 'measured'],
      question: `What does ${p.method.toUpperCase()} ${p.path} do, and who may call it?`,
      why: 'Express routes are plain functions: no CDS model, no CAP authorization, no generated test.',
      look: [r.evidence], expects: 'behaviour and access check (or its absence) with file:line',
    })
  }
}

function plugins(B, { g }) {
  for (const f of g.byType('PluginFile')) {
    const p = f.props
    const bound = g.byType('Handler').filter(h => h.props.file === p.path && h.props.service).length
    const id = B.finding({
      kind: 'plugin-code', key: p.path, title: `CAP plugin code: ${p.path}`, statement: `${p.path} is loaded by CAP as a plugin${p.package ? ` of the local package ${p.package}` : ''}; ${bound ? `${bound} handlers bound to a service` : 'no handler in it could be bound to a service'}${p.routes ? `, ${p.routes} bootstrap routes` : ''}.`,
      source: 'lib/extract/bootstrap.js', severity: { level: 'info' }, layer: 'Node', evidence: [f.evidence], subjects: [f.id], data: { package: p.package || null, handlers: bound },
    })
    if (!bound && p.registers) B.gap({
      kind: 'plugin-binding', key: p.path, about: [id], subjects: [f.id], priority: 'medium', resolvableBy: ['measured', 'ai'],
      question: `Which services and events does the plugin ${p.path} hook into?`,
      why: 'Plugins usually register in cds.on("served") callbacks on services found at runtime; the parser cannot bind those to a service.',
      look: [f.evidence], expects: 'service, phase, event per registration with file:line; the runtime addon records them in CI',
    })
  }
}

function limits(B, { project, g, root }) {
  // nothing to analyse: no CDS service at this root (a monorepo root, a UI-only folder, a wrong app path).
  // Without this the run is valid but silently empty (stress corpus seed config-monorepo).
  if (g && !g.byType('Service').length) B.finding({
    kind: 'analysis-limit', key: 'empty-model', title: 'No CDS service found at the app root', source: 'lib/extract/model.js',
    statement: `${root || 'The app root'} has no CDS service, so every section below is empty. Point the pipeline at the CAP project folder (cap-discovery and the workflow detect it: lib/project/detect.js).`,
    severity: { level: 'critical' }, layer: 'Config', evidence: [], subjects: [],
  })
  if (!project) return
  const errs = project.errors || []
  const compile = errs.filter(e => /cds\.load|compile/i.test(e))
  if (project.cds?.from === 'toolkit') {
    const id = B.finding({
      kind: 'analysis-limit', key: 'not-installed', title: 'App not installed: CAP was asked with the toolkit\'s @sap/cds',
      statement: `The app has no node_modules, so plugins (e.g. @cap-js/sqlite adds cds.requires.db) and packages that ship CDS models are missing from the probe's answer.${compile.length ? ' The model did not compile.' : ''}`,
      source: 'lib/project/probe.js', status: 'detected', severity: { level: compile.length ? 'critical' : 'info' }, layer: 'Config', evidence: [], subjects: [],
      data: { cds: project.cds?.version || null, errors: errs },
    })
    B.gap({
      kind: 'missing-install', key: 'not-installed', about: [id], priority: compile.length ? 'high' : 'low', resolvableBy: ['measured'],
      question: 'What do the installed plugins add to the config and the model?',
      why: 'Plugin config and CDS from packages only exist after npm install (F11, F12).',
      look: [{ file: 'package.json', why: 'dependencies and cds config' }], expects: 'a run in CI (Run discovery workflow), where the app is installed first',
    })
  } else if (compile.length) {
    B.finding({
      kind: 'analysis-limit', key: 'compile-error', title: 'The model did not compile', statement: compile.join('; '), source: 'lib/project/probe.js',
      severity: { level: 'critical' }, layer: 'Model', evidence: [], subjects: [], data: { errors: errs },
    })
  }
}

function classes(B, { td }) {
  for (const c of td.categories || []) for (const k of c.classes || []) {
    if (String(k.id).startsWith('AUT:') || !/verify/.test(String(k.expected))) continue
    B.gap({
      kind: 'class-expectation', key: k.id, subjects: [k.fact && !String(k.fact).includes(':') ? k.fact : null], priority: 'low', resolvableBy: ['measured', 'ai'],
      question: `What is the expected outcome of class "${k.name}" (${c.n})?`, why: 'The expected outcome is inferred from annotations only and needs a request against the running app.',
      look: [], expects: 'the outcome (status, message, data) a request shows', data: { category: c.n, class: k.id, input: k.input || null },
    })
  }
}

function slices(B, { slices: S }) {
  const ranked = [...(S || [])].sort((a, b) => b.risk - a.risk)
  ranked.forEach((s, i) => {
    const subjects = (s.members || []).slice(0, 40)
    B.gap({
      kind: 'slice-review', key: s.id, subjects, priority: i === 0 ? 'high' : i < 3 ? 'medium' : 'low', resolvableBy: ['ai'],
      question: `Slice ${s.id} ${s.name}: answer the 10 fixed questions (entry points, path, authorization, rules in business terms, states, events, errors, dependencies, deviations, test weaknesses).`,
      why: 'Business meaning, failure handling and fragile spots need reading and judgement; static analysis lists the parts but not what they are for.',
      look: (s.files || []).slice(0, 12).map(f => ({ file: f })), expects: 'answers per question with file:line, as in schema/facts.md (bin/brief.js writes the full brief)',
      data: { slice: s.id, risk: s.risk, questions: QUESTIONS.map(([q, text]) => `${q} ${text}`) },
    })
    B.gap({
      kind: 'business-criticality', key: s.id, subjects: subjects.slice(0, 5), priority: 'low', resolvableBy: ['human'],
      question: `How critical is ${s.name} for the business (1 to 5)?`, why: 'Code does not say what matters to the business; the slice ranking uses 0.5 until someone sets it.',
      look: [], expects: 'a number 1..5 and one sentence why', data: { slice: s.id },
    })
  })
}

function collectStatic(B, ctx) {
  const meta = { restrictAll: ctx.metrics?.auth?.restrictAll, root: ctx.root }
  const td = design(ctx.g, ctx.root, meta)
  const c = { ...ctx, meta, td }
  for (const fn of [limits, risks, patterns, uiPromises, authz, layers, lint, transitions, actions, nativeSql, routes, plugins, classes, slices]) fn(B, c)
}

module.exports = { collectStatic }
