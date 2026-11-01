// Addon "runtime": checks the static facts against the running app. The workflow's startup test loads
// record.js, starts the app with cds.test and writes run/runtime.json: every handler CAP really
// registered (with the line that registered it) and every served service's path. afterTests compares
// that with the handlers the static parser found (piece 3) and the service paths (piece 2), and adds
// the RTM section. Off: "runtime": false in discovery.config.json. Remove: delete addons/runtime.
// Walkthrough: docs/walkthrough/11-atlas-and-addons.md · Sources: docs/walkthrough/references.md (Runtime)
const fs = require('fs')
const path = require('path')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }
const were = n => `${n} ${n === 1 ? 'was' : 'were'}`
const LINE_TOLERANCE = 2 // a registration spanning lines (this.on(\n 'x', ...)) is reported at its first or last line

function compare(runtime, nodes) {
  const handlers = nodes.filter(n => n.type === 'Handler')
  const services = nodes.filter(n => n.type === 'Service')
  const own = runtime.registrations.filter(r => r.file)
  const matched = new Set()
  const rows = own.map(r => {
    const h = handlers.find(h => !matched.has(h.id) && h.props.file === r.file && h.props.phase === r.phase && Math.abs(h.props.line - r.line) <= LINE_TOLERANCE)
    if (h) matched.add(h.id)
    return { ...r, status: h ? 'confirmed' : 'runtime-only', handler: h?.id || null, ev: `${r.file}:${r.line}` }
  })
  const staticOnly = handlers.filter(h => !matched.has(h.id) && h.props.service).map(h => ({ handler: h.id, phase: h.props.phase, event: (h.props.events || []).join(','), path: h.props.target || '*', ev: h.evidence, status: 'static-only' }))
  const svc = runtime.services.filter(s => s.kind === 'application').map(s => {
    const n = services.find(n => n.props.name === s.name)
    const paths = s.endpoints.length ? s.endpoints.map(e => e.path) : [s.path]
    return { name: s.name, runtime: paths.join(', '), static: n?.props.path || null, ok: !!n && paths.includes(n.props.path) }
  })
  const plugins = [...new Set(runtime.registrations.filter(r => r.plugin).map(r => r.plugin))]
  const count = s => rows.filter(r => r.status === s).length
  return { cds: runtime.cds, profiles: runtime.profiles, rows, staticOnly, services: svc, plugins,
    confirmed: count('confirmed'), runtimeOnly: count('runtime-only'), staticOnlyCount: staticOnly.length, total: own.length }
}

function apply(D) {
  const R = D.RUNTIME
  const take = `The running app (cds ${R.cds}) registered <b>${R.total}</b> handlers from its own code: ${R.confirmed} match what the static parser found` +
    `${R.runtimeOnly ? `, <b>${R.runtimeOnly} it missed</b>` : ''}${R.staticOnlyCount ? `, and ${R.staticOnlyCount} found statically were not registered at startup` : ''}.` +
    ` Service paths: ${R.services.filter(s => s.ok).length} of ${R.services.length} as predicted.${R.plugins.length ? ` Plugins registering handlers: ${R.plugins.join(', ')}.` : ''}`
  const sec = { code: 'RTM', name: 'Runtime check', take, views: [{ k: 'A', label: 'Handlers' }] }
  const i = D.SECTIONS.findIndex(s => s.code === 'RTM')
  if (i >= 0) D.SECTIONS[i] = sec; else D.SECTIONS.push(sec)
  D.META.sources = { ...D.META.sources, RTM: 'running app (cds.test)' }
}

function afterTests({ out }) {
  const runtime = readJson(path.join(out, 'run', 'runtime.json'))
  const file = path.join(out, 'atlas-data.json')
  const D = readJson(file)
  if (!runtime || !D) return false
  D.RUNTIME = compare(runtime, readJsonl(path.join(out, 'run', 'graph', 'nodes.jsonl')))
  apply(D)
  fs.writeFileSync(file, JSON.stringify(D, null, 1))
  fs.mkdirSync(path.join(out, 'pr'), { recursive: true })
  fs.writeFileSync(path.join(out, 'pr', 'runtime.md'), summaryMd(D.RUNTIME))
  return true
}


// findings stage (after the app started in CI): where the parser and the running app disagree. A
// registration the parser missed for an action settles that action's "handler-missing" gap.
function findings(B, { D }) {
  const R = D?.RUNTIME; if (!R) return
  const missing = [...B.gaps.values()].filter(g => g.kind === 'handler-missing')
  for (const r of R.rows) {
    if (r.status === 'confirmed') continue
    const ev = String(r.event || '').split(',')
    const settles = missing.filter(g => g.subjects.some(s => ev.includes(String(s).split('.').pop()))).map(g => g.id)
    B.finding({ kind: 'handler-check', key: `runtime|${r.ev}|${r.phase}|${r.event}`, method: 'measured', source: 'addons/runtime (record.js)', status: 'confirmed',
      title: `${r.phase} ${r.event} on ${r.path || r.service}: registered at startup, missed by the parser`, statement: `The running app registered ${r.phase} ${r.event}${r.path ? ` on ${r.path}` : ''} at ${r.ev}; the static parser did not find it.`,
      severity: { level: 'warning' }, evidence: r.file ? [r.ev] : [], resolves: settles, data: { phase: r.phase, event: r.event, path: r.path, service: r.service || null } })
  }
  for (const h of R.staticOnly) {
    B.finding({ kind: 'handler-check', key: `static|${h.handler}`, method: 'measured', source: 'addons/runtime (record.js)', status: 'suspected', confidence: 'medium',
      title: `${h.phase} ${h.event} on ${h.path}: parsed, not registered at startup`, statement: 'The parser found this handler, but the app did not register it while starting: registered later, conditionally, or dead code.',
      severity: { level: 'info' }, evidence: [h.ev], subjects: [h.handler], data: { phase: h.phase, event: h.event, path: h.path } })
  }
}

const cell = s => String(s ?? '').replace(/\|/g, '\\|')
const ICON = { confirmed: '✅', 'runtime-only': '❗', 'static-only': '⚠️' }
function summaryMd(R) {
  return [`### Runtime check (the app started with cds.test)`, '',
    `**${R.confirmed} of ${R.total} handlers the app registered were found by the static parser**${R.runtimeOnly ? `; ${were(R.runtimeOnly)} missed` : ''}${R.staticOnlyCount ? `; ${R.staticOnlyCount} parsed handler${R.staticOnlyCount === 1 ? ' was' : 's were'} not registered at startup` : ''}.`, '',
    ...(R.runtimeOnly || R.staticOnlyCount ? ['<details><summary>Differences</summary>', '', '| | Phase | Event | Entity | Where |', '| --- | --- | --- | --- | --- |',
      ...[...R.rows.filter(r => r.status !== 'confirmed'), ...R.staticOnly].map(r => `| ${ICON[r.status]} ${r.status} | ${r.phase} | ${cell(r.event)} | ${cell(r.path)} | \`${r.ev}\` |`), '', '</details>', ''] : []),
    ...R.services.filter(s => !s.ok).map(s => `- Service ${s.name}: served at \`${s.runtime}\`, predicted \`${s.static}\``), ''].join('\n')
}

const topics = {
  RTM: D => {
    const R = D.RUNTIME
    return [`The app was started in CI with cds.test (cds ${R.cds}, profiles ${R.profiles.join(', ')}). Every srv.before/on/after call was recorded with the line that made it, then compared with the handlers found by reading the code.`, '',
      'Legend: ✅ registered and found by the parser · ❗ registered, but the parser missed it · ⚠️ found by the parser, not registered at startup (conditional, registered later, or dead code).', '',
      '### Handlers', '', '| | Service | Phase | Event | Entity | Where |', '| --- | --- | --- | --- | --- | --- |',
      ...[...R.rows, ...R.staticOnly].map(r => `| ${ICON[r.status]} | ${cell(r.service || '')} | ${r.phase} | ${cell(r.event)} | ${cell(r.path)} | \`${r.ev}\` |`), '',
      '### Service paths', '', '| Service | Served at | Predicted | |', '| --- | --- | --- | --- |',
      ...R.services.map(s => `| ${s.name} | \`${s.runtime}\` | \`${s.static}\` | ${s.ok ? '✅' : '❗'} |`), '',
      ...(R.plugins.length ? ['### Plugins that register handlers', '', ...R.plugins.map(p => `- ${p}`), ''] : [])].join('\n')
  },
}

module.exports = { afterTests, findings, topics, views: path.join(__dirname, 'view.js'), compare, summaryMd }
