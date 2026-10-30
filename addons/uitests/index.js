// Addon "uitests": UI tests for what the Fiori elements UI promises (actions offered per status,
// fields read-only, Create / Delete hidden), generated as OPA5 journeys (sap.fe.test) and run headless
// in the app (run.js). Adds the UIT section: per promise and state, does the UI block it, does the
// server block it ("two locks"), and did the UI test pass.
// Off: "uitests": false in discovery.config.json. Remove: delete addons/uitests (and the CI step).
const fs = require('fs')
const path = require('path')
const { plan } = require('./plan')
const opa = require('./opa')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const STATUS = ['passed', 'failed', 'notrun', 'generated']
const LABEL = { passed: 'passed', failed: 'failed', notrun: 'not run (an earlier check in the same visit failed)', generated: 'generated, not run yet' }
const ICON = { passed: '✅', failed: '❌', notrun: '⏭️', generated: '🧪' }
// two locks: does the UI block it, does the server block it
const LOCK = { both: 'UI and server block it', ui: 'UI only: bypassable with a plain OData call', server: 'server only: the UI offers what the server refuses', none: 'allowed in this state' }
const lockOf = c => c.ui === 'blocks' ? (c.server === 'blocks' ? 'both' : 'ui') : c.server === 'blocks' ? 'server' : 'none'

// rows = one promise (action, field set, table button), columns = states
function locks(cases, names = {}) {
  const order = Object.keys(names)
  const rows = [], cols = [...new Set(cases.map(c => c.state ?? '—'))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
  const label = c => c.kind === 'action' ? `${c.check.action}` : c.kind === 'field' ? `${c.entity} fields (field control)` : c.kind === 'readonly' ? `${c.entity} @readonly fields` : `${c.check.button} ${c.entity}`
  for (const c of cases) {
    let r = rows.find(r => r.label === label(c))
    if (!r) rows.push(r = { label: label(c), kind: c.kind, cells: {} })
    r.cells[c.state ?? '—'] = c.id
  }
  return { cols, rows, heads: cols.map(s => names[s] ? `${s} (${names[s]})` : s) }
}

function summarize(U) {
  U.counts = Object.fromEntries(STATUS.map(s => [s, U.cases.filter(c => c.status === s).length]))
  U.lockCounts = Object.fromEntries(Object.keys(LOCK).map(k => [k, U.cases.filter(c => lockOf(c) === k).length]))
  U.label = LABEL; U.lockLabel = LOCK
  U.locks = locks(U.cases, U.states)
}

function apply(D) {
  const U = D.UITESTS
  summarize(U)
  const rules = new Set(U.cases.map(c => c.rule)).size
  const take = !U.cases.length ? `No UI check generated: ${U.skipped.length} UI promise(s) found, none testable in a Fiori elements object page (reasons under "Not generated").` : U.ran
    ? `${U.counts.passed} of ${U.cases.length} UI checks passed in the running app${U.counts.failed ? `, <b>${U.counts.failed} failed</b>` : ''}${U.counts.notrun ? `, ${U.counts.notrun} not run` : ''}. They cover ${rules} UI promises in ${U.visits.length} app starts. <b>${U.lockCounts.ui} states are guarded by the UI only</b>: the backend tests show the server accepts them.`
    : `${U.cases.length} UI checks generated from ${rules} UI promises (${U.visits.length} app starts, OPA5 + sap.fe.test), not run yet. <b>${U.lockCounts.ui} states are guarded by the UI only</b>; ${U.skipped.length} promises are not testable in the UI (reasons listed).`
  const sec = { code: 'UIT', name: 'UI tests', take, views: [{ k: 'A', label: 'Two locks' }, { k: 'B', label: 'Test runs' }, { k: 'C', label: 'Not generated' }] }
  const i = D.SECTIONS.findIndex(s => s.code === 'UIT')
  if (i >= 0) D.SECTIONS[i] = sec
  else { const t = D.SECTIONS.findIndex(s => s.code === 'UIS'); D.SECTIONS.splice(t >= 0 ? t + 1 : D.SECTIONS.length, 0, sec) }
  D.KPIS = D.KPIS.filter(k => !/^UI checks/.test(k[1])).concat([U.ran ? [`${U.counts.passed} / ${U.cases.length}`, 'UI checks passed', U.counts.failed ? 'c' : ''] : [String(U.cases.length), 'UI checks generated', '']])
  D.META.sources = { ...D.META.sources, UIT: U.ran ? 'generated + UI test results' : 'generated' }
}

function facts(D, { g, csn, root, runDir }) {
  const P = plan(g, csn, root)
  const dir = path.join(runDir, 'tests', 'ui')
  fs.rmSync(dir, { recursive: true, force: true })
  for (const app of P.apps) {
    fs.mkdirSync(path.join(dir, app.id), { recursive: true })
    fs.writeFileSync(path.join(dir, app.id, 'uitests.qunit.html'), opa.html(app))
    fs.writeFileSync(path.join(dir, app.id, 'uitests.qunit.js'), opa.js(app, P))
  }
  if (P.apps.length) fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(P, null, 1))
  if (!P.cases.length && !P.skipped.length) return
  D.UITESTS = { ran: false, states: P.states, apps: P.apps.map(a => ({ id: a.id, webapp: a.webapp })), visits: P.visits, skipped: P.skipped,
    cases: P.cases.map(c => ({ ...c, status: 'generated' })) }
  apply(D)
}

// the line of an OPA failure that says what was wrong (OPA puts it after "This is what Opa logged")
const why = m => { const ls = m.split('\n').map(l => l.trim()).filter(Boolean); return (ls.find(l => /but should|should be|not found:|HTTP \d|Failed to/.test(l)) || ls[0]).replace(/^Control '[^']*?#[^']*?--/, "Control '").replace(/\s+-\s+sap\.ui\.test\.matchers\.\w+$/, '') }

// map the marker assertions of each visit back to its cases
function classify(U, results) {
  const tests = results.apps.flatMap(a => (a.tests || []).map(t => ({ ...t, app: a.id })))
  const byId = new Map(U.cases.map(c => [c.id, c]))
  for (const v of U.visits) {
    const t = tests.find(t => t.app === v.app && t.name.startsWith(v.id + ' '))
    let broken = false
    for (const id of v.cases) {
      const c = byId.get(id)
      if (!t) { c.status = 'notrun'; c.msg = 'the visit did not run'; continue }
      if (t.assertions.some(a => a.result && a.message.startsWith(`[${id}]`))) { c.status = 'passed'; delete c.msg; continue }
      if (!broken && t.failed) {
        broken = true; c.status = 'failed'
        c.msg = t.assertions.filter(a => !a.result).map(a => why(a.message)).join(' · ').slice(0, 400)
        if (t.screenshot) c.shot = t.screenshot
      } else { c.status = 'notrun'; c.msg = t.failed ? 'an earlier check in this visit failed' : 'no result' }
    }
  }
  U.ran = true
  U.run = { at: results.at, user: results.user, apps: results.apps.map(a => ({ id: a.id, seconds: a.seconds, total: a.total, failed: a.failed, error: a.error, timedOut: a.timedOut })),
    baseline: (results.baseline || []).map(b => ({ id: b.id, page: b.page, tests: b.tests.length, failed: b.tests.filter(t => t.failed).length, names: b.tests.map(t => [t.name, t.failed ? 'failed' : 'passed']) })) }
}

function afterTests({ out }) {
  const results = readJson(path.join(out, 'run', 'tests', 'ui', 'results.json'))
  const file = path.join(out, 'atlas-data.json')
  const D = readJson(file)
  if (!D?.UITESTS || !results?.ran) return false
  classify(D.UITESTS, results)
  apply(D)
  fs.writeFileSync(file, JSON.stringify(D, null, 1))
  fs.mkdirSync(path.join(out, 'pr'), { recursive: true })
  fs.writeFileSync(path.join(out, 'pr', 'uitests.md'), summaryMd(D.UITESTS))
  return true
}

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
function locksMd(U) {
  const by = new Map(U.cases.map(c => [c.id, c]))
  const mk = id => { if (!id) return ''; const c = by.get(id); return `${ICON[c.status]} ${{ both: 'both block', ui: '**UI only**', server: 'server only', none: 'allowed' }[lockOf(c)]}` }
  return [`| UI promise | ${U.locks.heads.map(cell).join(' | ')} |`, `| --- | ${U.locks.cols.map(() => '---').join(' | ')} |`,
    ...U.locks.rows.map(r => `| ${cell(r.label)} | ${U.locks.cols.map(s => mk(r.cells[s])).join(' | ')} |`)].join('\n')
}
function summaryMd(U) {
  const fails = U.cases.filter(c => c.status === 'failed')
  return ['### UI tests (OPA5, generated from the UI annotations)', '',
    U.ran ? `**${U.counts.passed} of ${U.cases.length} UI checks passed**${U.counts.failed ? `, ${U.counts.failed} failed` : ''}${U.counts.notrun ? `, ${U.counts.notrun} not run` : ''} (${U.run.apps.map(a => `${a.id}: ${a.seconds ?? '?'}s`).join(', ')}).` : `${U.cases.length} UI checks generated, not run.`, '',
    `**${U.lockCounts.ui} states are guarded by the UI only** (the server accepts them through OData), ${U.lockCounts.both} by UI and server.`, '',
    ...(fails.length ? ['| Failed check | Why |', '| --- | --- |', ...fails.map(c => `| \`${c.id}\` ${cell(c.title)} | ${cell(c.msg)} |`), ''] : []),
    ...(U.run?.baseline?.length ? [`The app's own OPA tests: ${U.run.baseline.map(b => `${b.page} ${b.tests - b.failed}/${b.tests} passed`).join(', ')}.`, ''] : []),
    '<details><summary>Two locks per UI promise and state</summary>', '', locksMd(U), '', '</details>', ''].join('\n')
}

const topics = {
  UIT: D => {
    const U = D.UITESTS
    return [U.ran ? `Run ${U.run.at} as \`${U.run.user}\`: ${U.counts.passed} passed, ${U.counts.failed} failed, ${U.counts.notrun} not run.` : 'Generated, not run yet: the statuses below are "generated".', '',
      'Each check opens the Fiori elements app on a seed record in one state (an equivalence class) and asserts what the annotations promise. The journeys are OPA5 with `sap.fe.test`, in `run/tests/ui/<app-id>/`; copy them to `<webapp>/test/discovery/` and open `uitests.qunit.html`, or run `node addons/uitests/run.js <out> <app>`.', '',
      '### Two locks', '', 'Per UI promise and state: who blocks it (UI, server, both) and the UI test result. **UI only** = the UI hides or disables it, but a plain OData call goes through (see the UIS section and the backend spec tests).', '',
      locksMd(U), '',
      '### Checks', '', '| Check | Visit | Record | Kind | UI | Server | Status | Evidence |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...U.cases.map(c => { const v = U.visits.find(v => v.id === c.visit); return `| \`${cell(c.id)}\` ${cell(c.title)} | ${c.visit} (${v.mode}) | ${cell(v.record)} | ${c.kind} | ${c.ui} | ${c.server} | ${ICON[c.status]} ${LABEL[c.status]}${c.msg ? ': ' + cell(c.msg) : ''}${c.shot ? ` ([screenshot](../../${c.shot}))` : ''} | \`${c.ev}\` |` }), '',
      ...(U.run?.baseline?.length ? ['### The app\'s own OPA tests (baseline)', '', '| Page | Test | Result |', '| --- | --- | --- |', ...U.run.baseline.flatMap(b => b.names.map(([n, s]) => `| ${b.page} | ${cell(n)} | ${s} |`)), ''] : []),
      '### Not generated', '', '| Promise | Why not | Evidence |', '| --- | --- | --- |', ...U.skipped.map(s => `| ${cell(s.what)} | ${cell(s.why)} | \`${s.ev}\` |`)].join('\n')
  }
}

module.exports = { facts, afterTests, topics, views: path.join(__dirname, 'view.js'), summaryMd, lockOf, classify }
