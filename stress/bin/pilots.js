#!/usr/bin/env node
// The real pilots, three ways (static analysis only: nothing of the pilots is installed or run here):
//   determinism  run discovery twice on the same commit; findings, gaps and atlas facts must be identical
//   compare      this toolkit vs another checkout (--base-toolkit, e.g. main): every alarm that appears or
//                disappears, for a person to judge (new rules must not flood real apps with noise)
//   mutation     small automatic edits (drop a @requires, delete a guard, flip a comparison, rename a
//                handler or an emitted event, drop a model constraint); each must change at least one finding,
//                else it is a blind spot
//   node stress/bin/pilots.js <pilots-dir> [--base-toolkit <dir>] [--only incidents] [--jobs 4] [--max 4]
// <pilots-dir> holds the clones (names as below). Writes stress/report/PILOTS.md and pilots.json.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const { readRun, isAlarm, checkOf } = require('../lib/score')

const STRESS = path.join(__dirname, '..'), TOOLKIT = path.join(STRESS, '..')
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const DIR = path.resolve(args.find((a, i) => !a.startsWith('--') && !['--base-toolkit', '--only', '--jobs', '--max', '--work'].includes(args[i - 1])) || '')
const BASE = opt('--base-toolkit') && path.resolve(opt('--base-toolkit'))
const WORK = path.resolve(opt('--work', path.join(os.tmpdir(), 'stress-pilots')))
const JOBS = +opt('--jobs', 4), MAX = +opt('--max', 3)
const PILOTS = [
  { id: 'incidents', dir: 'incidents-app' },
  { id: 'sflight', dir: 'cap-sflight' },
  { id: 'event-app', dir: 'ui5-cap-event-app' },
  { id: 'codejam', dir: 'cap-hana-exercises-codejam', app: 'solution/MyHANAApp' },
  { id: 'bookstore', dir: 'samples', app: 'bookstore', ui: '-' },
  { id: 'poetry-slam', dir: 'partner-reference-application' },
].filter(p => !opt('--only') || opt('--only').split(',').includes(p.id))

function node(toolkit, script, a) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(toolkit, 'bin', script), ...a], { cwd: toolkit, env: { ...process.env, DISCOVERY_IMAGES: 'off', DISCOVERY_OPENGREP: process.env.DISCOVERY_OPENGREP || 'off' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
    p.on('close', code => resolve({ code, out }))
  })
}
async function discover(toolkit, root, ui, out) {
  fs.rmSync(out, { recursive: true, force: true })
  const run = path.join(out, 'run')
  for (const [s, a] of [['discover.js', [root, run, ...(ui ? ['--ui', ui] : [])]], ['atlas-facts.js', [run, path.join(out, 'atlas-data.json')]], ['findings.js', [out, '--mode', 'static']]]) {
    const r = await node(toolkit, s, a)
    if (r.code !== 0) return { ok: false, step: s, log: r.out.trim().split('\n').slice(-5).join('\n') }
  }
  return { ok: true, ...readRun(out) }
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } })); return out }
function copy(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name)
    // installed packages are linked, not copied: the model imports them (@sap/cds-common-content, @capire/*)
    if (e.name === 'node_modules') { fs.symlinkSync(a, b, 'dir'); continue }
    if (['.git', 'gen', 'dist', 'mta_archives'].includes(e.name)) continue
    if (e.isDirectory()) copy(a, b); else if (e.isFile()) fs.copyFileSync(a, b)
  }
}
const sig = f => JSON.stringify([f.title, f.statement, f.severity, f.data, f.status])
// run-independent view of the atlas facts: drop timestamps and run ids
const stable = file => { try { return JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'), (k, v) => ['run', 'generated', 'at', 'date', 'commit', 'seconds', 'started'].includes(k) ? undefined : v)) } catch { return null } }

function diffRuns(a, b) {
  const A = new Map(a.findings.map(f => [f.id, f])), B = new Map(b.findings.map(f => [f.id, f]))
  const added = b.findings.filter(f => !A.has(f.id)), removed = a.findings.filter(f => !B.has(f.id))
  const changed = b.findings.filter(f => A.has(f.id) && sig(A.get(f.id)) !== sig(f))
  const gA = new Set(a.gaps.map(g => g.id)), gB = new Set(b.gaps.map(g => g.id))
  return { added, removed, changed, gapsAdded: b.gaps.filter(g => !gA.has(g.id)), gapsRemoved: a.gaps.filter(g => !gB.has(g.id)), same: !added.length && !removed.length && !changed.length && gA.size === gB.size && [...gA].every(x => gB.has(x)) }
}

// ---- mutation operators: (files of the app) -> [{ op, file, line, before, after }] ----
const walk = (d, rel = '', acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', 'gen', 'webapp', 'test', 'dist', '@cds-models'].includes(e.name) || e.name.startsWith('.')) continue; const p = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(p, r, acc); else acc.push(r) } return acc }
const OPS = [
  { op: 'drop-requires', files: /\.cds$/, line: /@requires\s*:\s*['"[]/, edit: l => l.replace(/@requires\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/, '') },
  { op: 'drop-restrict-where', files: /\.cds$/, line: /where\s*:\s*['"]/, edit: l => l.replace(/,?\s*where\s*:\s*('[^']*'|"[^"]*")/, '') },
  { op: 'delete-guard', files: /\.[jt]s$/, line: /^\s*if\s*\(.*\)\s*(return\s+)?(req\.(reject|error)|throw)\b.*$/, edit: () => '' },
  { op: 'flip-comparison', files: /\.[jt]s$/, line: /^\s*if\s*\(.*(!==|===).*\)\s*(return\s+)?(req\.(reject|error)|throw)\b/, edit: l => l.includes('!==') ? l.replace('!==', '===') : l.replace('===', '!==') },
  { op: 'rename-handler', files: /\.[jt]s$/, line: /\.(on|before|after)\(\s*['"][a-z]\w*['"]/, edit: l => l.replace(/\.(on|before|after)\(\s*(['"])([a-z]\w*)\2/, (m, p, q, n) => `.${p}(${q}${n}Mutant${q}`) },
  { op: 'rename-emit', files: /\.[jt]s$/, line: /\.emit\(\s*['"]\w/, edit: l => l.replace(/\.emit\(\s*(['"])([\w.]+)\1/, (m, q, n) => `.emit(${q}${n}Mutant${q}`) },
  { op: 'drop-constraint', files: /\.cds$/, line: /@(mandatory|assert\.range|assert\.target|readonly)\b/, edit: l => l.replace(/@(mandatory|readonly|assert\.target)\b(\s*:\s*true)?|@assert\.range\s*:\s*\[[^\]]*\]|@assert\.range\b/, '') },
]
// only what CAP loads: the db, srv and app folders of the project (cds.folders), and server.js
function mutants(root, max) {
  const { layout } = require(path.join(TOOLKIT, 'lib/project/layout'))
  const L = layout(root)
  const files = [...new Set([L.db, L.srv, L.app].map(d => String(d).replace(/\/+$/, '')))].filter(d => fs.existsSync(path.join(root, d))).flatMap(d => walk(path.join(root, d), d))
    .concat(fs.existsSync(path.join(root, 'server.js')) ? ['server.js'] : [])
  const out = []
  for (const o of OPS) {
    let n = 0
    const srvDir = String(L.srv).replace(/\/+$/, '')
    for (const f of files.filter(f => o.files.test(f) && !/node_modules|\.d\.ts$/.test(f) && (/\.cds$/.test(f) || f.startsWith(srvDir + '/') || f === 'server.js'))) {
      const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n')
      lines.forEach((l, i) => {
        if (n >= max || !o.line.test(l) || /^\s*(\/\/|\*)/.test(l)) return
        const after = o.edit(l)
        if (after === l) return
        out.push({ op: o.op, file: f, line: i + 1, before: l.trim().slice(0, 140), after: after.trim().slice(0, 140) }); n++
      })
    }
  }
  return out
}

async function main() {
  if (!fs.existsSync(DIR)) { console.error('usage: pilots.js <pilots-dir> [--base-toolkit dir] [--only id,id] [--jobs n] [--max n]'); process.exit(2) }
  const { detect } = require(path.join(TOOLKIT, 'lib/project/detect'))
  const report = { at: new Date().toISOString(), pilots: [] }
  for (const p of PILOTS) {
    const repo = path.join(DIR, p.dir)
    if (!fs.existsSync(repo)) { console.log(`${p.id}: not cloned, skipped`); continue }
    const det = await detect(repo, { appArg: p.app || '', uiArg: p.ui || '', curatedDir: path.join(TOOLKIT, 'curated') })
    const root = path.join(repo, det.app), ui = det.ui || null
    const W = path.join(WORK, p.id)
    const t = Date.now()
    const [r1, r2, rb] = await Promise.all([discover(TOOLKIT, root, ui, path.join(W, 'run1')), discover(TOOLKIT, root, ui, path.join(W, 'run2')), BASE ? discover(BASE, root, ui, path.join(W, 'base')) : null])
    const P = { id: p.id, app: det.app, ui, seconds: Math.round((Date.now() - t) / 1000) }
    if (!r1.ok) { P.error = `${r1.step}: ${r1.log}`; report.pilots.push(P); console.log(`${p.id}: ${P.error}`); continue }
    const d = diffRuns(r1, r2)
    const atlasSame = stable(path.join(W, 'run1', 'atlas-data.json')) === stable(path.join(W, 'run2', 'atlas-data.json'))
    P.findings = r1.findings.length; P.alarms = r1.findings.filter(isAlarm).length; P.gaps = r1.gaps.length
    P.determinism = { same: d.same && atlasSame, findings: d.same, atlas: atlasSame, diff: d.same ? null : { added: d.added.map(f => f.title).slice(0, 5), removed: d.removed.map(f => f.title).slice(0, 5), changed: d.changed.map(f => f.title).slice(0, 5) } }
    if (rb?.ok) {
      const c = diffRuns(rb, r1)
      const al = f => ({ check: checkOf(f), title: f.title, ev: f.evidence?.[0] ? `${f.evidence[0].file}:${f.evidence[0].line}` : '' })
      P.compare = { before: rb.findings.filter(isAlarm).length, after: P.alarms, newAlarms: c.added.filter(isAlarm).map(al), goneAlarms: c.removed.filter(isAlarm).map(al), changedAlarms: c.changed.filter(isAlarm).map(al) }
    }
    // mutation: one copy of the app per mutant, outside the repo
    const ms = mutants(root, MAX)
    const appRel = path.relative(repo, root)
    P.mutants = await pool(ms, JOBS, async (m, k) => {
      const id = `${m.op}-${m.file.replace(/\W+/g, '_')}-${m.line}`
      const copyDir = path.join(W, 'm', id)
      fs.rmSync(copyDir, { recursive: true, force: true }); copy(repo, copyDir)
      const f = path.join(copyDir, appRel, m.file), lines = fs.readFileSync(f, 'utf8').split('\n')
      lines[m.line - 1] = OPS.find(o => o.op === m.op).edit(lines[m.line - 1]); fs.writeFileSync(f, lines.join('\n'))
      const r = await discover(TOOLKIT, path.join(copyDir, appRel), ui, path.join(copyDir, '.out'))
      fs.rmSync(copyDir, { recursive: true, force: true })
      if (!r.ok) return { ...m, killed: null, error: r.step }
      const x = diffRuns(r1, r)
      const alarmsNew = x.added.filter(isAlarm).map(f => f.title)
      return { ...m, killed: !x.same, alarm: alarmsNew.length > 0, by: [...x.added.map(f => `+ ${checkOf(f)}`), ...x.changed.map(f => `~ ${checkOf(f)}`), ...x.removed.map(f => `- ${checkOf(f)}`)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6) }
    })
    report.pilots.push(P)
    const killed = P.mutants.filter(m => m.killed).length
    console.log(`${p.id}: ${P.findings} findings, deterministic=${P.determinism.same}, mutants killed ${killed}/${P.mutants.length}${P.compare ? `, alarms ${P.compare.before} -> ${P.compare.after} (+${P.compare.newAlarms.length} -${P.compare.goneAlarms.length})` : ''} (${Math.round((Date.now() - t) / 1000)}s)`)
  }
  const rep = path.join(STRESS, 'report')
  fs.writeFileSync(path.join(rep, 'pilots.json'), JSON.stringify(report, null, 1))
  fs.writeFileSync(path.join(rep, 'PILOTS.md'), renderPilots(report))
}

function renderPilots(R) {
  const cell = s => String(s ?? '').replace(/\|/g, '\\|')
  const md = ['# Real pilots: determinism, mutation, before/after', '', `Generated by \`node stress/bin/pilots.js\` on ${R.at.slice(0, 16).replace('T', ' ')} UTC. Static analysis only (nothing of the pilots is installed or run).`, '']
  md.push('| Pilot | Findings | Alarms | Same result twice | Mutants that changed a finding | Alarms before → after this branch |', '| --- | ---: | ---: | --- | --- | --- |')
  for (const p of R.pilots) {
    if (p.error) { md.push(`| ${p.id} | error: ${cell(p.error)} | | | | |`); continue }
    const k = p.mutants.filter(m => m.killed).length, n = p.mutants.filter(m => m.killed !== null).length
    md.push(`| ${p.id} | ${p.findings} | ${p.alarms} | ${p.determinism.same ? '✅' : `❌ ${cell(JSON.stringify(p.determinism.diff))}`} | ${k} of ${n} (${n ? Math.round(k / n * 100) : 0}%) | ${p.compare ? `${p.compare.before} → ${p.compare.after} (+${p.compare.newAlarms.length}, −${p.compare.goneAlarms.length}, ~${p.compare.changedAlarms.length})` : '–'} |`)
  }
  md.push('', '## Mutation operators', '', '| Operator | Mutants | Changed a finding | Raised an alarm |', '| --- | ---: | ---: | ---: |')
  const all = R.pilots.flatMap(p => (p.mutants || []).map(m => ({ ...m, pilot: p.id }))).filter(m => m.killed !== null)
  for (const o of OPS.map(o => o.op)) { const ms = all.filter(m => m.op === o); if (ms.length) md.push(`| ${o} | ${ms.length} | ${ms.filter(m => m.killed).length} | ${ms.filter(m => m.alarm).length} |`) }
  md.push('', '## Survivors (blind spots)', '', 'Edits that changed nothing in the findings. Each is either a real blind spot or an edit without effect (judged in the README).', '', '| Pilot | Operator | Where | Edit |', '| --- | --- | --- | --- |')
  for (const m of all.filter(m => !m.killed)) md.push(`| ${m.pilot} | ${m.op} | ${m.file}:${m.line} | \`${cell(m.before)}\` → \`${cell(m.after) || '(deleted)'}\` |`)
  md.push('', '## Alarm changes against the base toolkit', '')
  for (const p of R.pilots.filter(p => p.compare)) {
    md.push(`### ${p.id}`, '')
    if (!p.compare.newAlarms.length && !p.compare.goneAlarms.length && !p.compare.changedAlarms.length) { md.push('No alarm changed.', ''); continue }
    md.push('| Change | Check | Alarm | Evidence |', '| --- | --- | --- | --- |')
    for (const [w, list] of [['new', p.compare.newAlarms], ['gone', p.compare.goneAlarms], ['changed', p.compare.changedAlarms]]) for (const a of list) md.push(`| ${w} | \`${a.check}\` | ${cell(a.title)} | ${a.ev} |`)
    md.push('')
  }
  return md.join('\n')
}

main().catch(e => { console.error(e); process.exit(1) })
