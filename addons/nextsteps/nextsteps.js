// Turns the atlas facts into ranked next steps, each with a prompt block for a coding agent.
// One item per finding: when a section fact cites the same file:line as a risk, it joins that risk
// (listed in both sections) instead of becoming a second item.
//
// Priority = impact × likelihood (1–5 each), the same scale as the risk heatmap:
//   P1 >= 16 (do now) · P2 >= 9 (next) · P3 below (later)

const KIND = {
  fix: 'Fix',
  test: 'Test',
  verify: 'Verify',
  review: 'Review'
}
const DO = {
  fix: 'Change the app so the finding no longer holds. Keep the change small and in the layer named; do not touch unrelated behaviour.',
  test: 'Write a cds.test (Jest) for this case. If today\'s behaviour differs from the expected one, pin today\'s behaviour in one test and add the intended one as `it.skip` with the reason.',
  verify: 'Check with a request against the app (cds.test, in-memory SQLite) whether this holds. Report the observed status and body. Do not change app code.',
  review: 'Read the cited code and decide: keep, change, or document. Give the decision in two sentences; change code only if it is clearly wrong.'
}
// how much an untested class matters, by category (same order as the coverage addon's ranking)
const CW = { Authorization: 4, 'UI vs server rules': 3, 'Status transitions': 3, 'Handler rules': 3, 'Draft lifecycle': 2, 'Framework constraints': 1 }

const strip = s => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
const evs = e => (Array.isArray(e) ? e : String(e || '').split(' · ')).map(x => String(x).trim()).filter(Boolean)
const band = s => s >= 16 ? 'P1' : s >= 9 ? 'P2' : 'P3'

function items(D) {
  const out = [], byEv = new Map()
  const add = (it) => {
    it.ev = evs(it.ev); it.i = Math.max(1, Math.min(5, it.i)); it.l = Math.max(1, Math.min(5, it.l))
    // same evidence as an item already listed (a risk): join it instead of repeating it
    const twin = it.join !== false && it.ev.map(e => byEv.get(e)).find(Boolean)
    if (twin) { if (!twin.secs.includes(it.sec)) twin.secs.push(it.sec); return twin }
    const x = { id: `${it.sec}:${it.ref}`, sec: it.sec, secs: [it.sec, ...(it.also || [])], ref: it.ref, kind: it.kind, title: strip(it.title), why: strip(it.why), ev: it.ev, i: it.i, l: it.l, score: it.i * it.l, band: band(it.i * it.l), done: strip(it.done || '') }
    out.push(x); for (const e of x.ev) if (!byEv.has(e)) byEv.set(e, x)
    return x
  }

  // risks first, so section facts with the same evidence join them
  for (const r of D.RISKS || []) add({ sec: 'RSK', ref: r.id, kind: 'fix', title: r.t, why: r.d, ev: r.ev, i: r.i, l: r.l, done: r.test ? `A test does this: ${r.test} It fails on today's code and passes after the fix.` : '' })

  for (const [b, ui, node, v, e] of D.PARITY || []) {
    if (v === 'ui-only') add({ sec: 'UIS', ref: b, kind: 'fix', title: `Server does not enforce: ${b}`, why: `The UI promises "${ui}"; the Node server has ${node}. A direct OData call bypasses the rule.`, ev: e, i: 4, l: 3, done: 'A cds.test sends the request the UI hides or blocks and expects a 4xx rejection.' })
    else if (v === 'partial' || v === 'stricter') add({ sec: 'UIS', ref: b, kind: 'verify', title: `UI and server differ: ${b}`, why: `UI: ${ui}. Server: ${node}.`, ev: e, i: 3, l: 3, done: 'One cds.test per state where UI and server disagree, with the observed result.' })
  }

  const roles = (D.ROLES || []).map(r => r[1])
  for (const a of D.AUTH || []) {
    const cells = a.c.map(c => typeof c === 'string' ? { v: c } : c)
    const open = roles.filter((_, k) => cells[k]?.v === 'r'), unclear = roles.filter((_, k) => cells[k]?.v === 'a')
    const pii = /PII/.test(a.op)
    if (open.length) add({ sec: 'AUT', ref: a.op, kind: 'fix', title: `${a.op} open to ${open.length === roles.length ? 'every caller' : open.join(', ')}`, why: `${a.svc || ''}: allowed without the role you would expect${pii ? '; the entity holds personal data' : ''}.${a.note ? ' ' + a.note : ''}`, ev: a.ev, i: pii ? 5 : 3, l: 4, done: `A cds.test calls ${a.op.replace(/ \(.*/, '')} as ${open[0]} and expects 401/403.` })
    if (unclear.length) add({ sec: 'AUT', ref: a.op + ' (unclear)', kind: 'verify', title: `Check access: ${a.op} as ${unclear.join(', ')}`, why: 'The grant depends on inheritance or on the auth setup in front of the service.', ev: a.ev, i: 2, l: 3, join: false, done: 'Observed status per user, recorded in a cds.test.' })
  }

  for (const t of D.TR || []) {
    if (!!t.ui === !!t.node) continue
    const what = `${t.a} ${t.f} → ${t.t}`
    if (t.node) add({ sec: 'STA', ref: what, kind: 'fix', title: `Server allows ${what}, the UI hides it`, why: `The status machine of ${D.STATES?.entity || 'the entity'} permits this transition through OData although the UI never offers it.`, ev: t.ev, i: 3, l: 3, done: `A cds.test calls ${t.a} on a record in state ${t.f} and expects a rejection.` })
    else add({ sec: 'STA', ref: what, kind: 'verify', title: `UI offers ${what}, the server refuses it`, why: 'The user sees an action that fails.', ev: t.ev, i: 2, l: 4, done: `A cds.test calls ${t.a} in state ${t.f} and records the result.` })
  }

  for (const p of D.PATTERNS || []) {
    if (p.h === 'cr') add({ sec: 'PAT', ref: p.n, kind: 'fix', title: `${p.n}: ${p.x || 'causes a defect or exposure'}`, why: `${p.w} (${p.k} uses).`, ev: p.ev, i: 4, l: 3 })
    else if (p.h === 'wn') add({ sec: 'PAT', ref: p.n, kind: 'review', title: `${p.n}: ${p.x || 'enforced in the wrong place'}`, why: `${p.w} (${p.k} uses).`, ev: p.ev, i: 2, l: 3 })
  }

  for (const [f, t, k, why, e] of D.DEPS || []) if (k === 'bad') add({ sec: 'DEP', ref: `${f} → ${t}`, kind: 'review', title: `${f} reaches into ${t}`, why: why || 'A file changes a model of another layer.', ev: e, i: 2, l: 3 })

  for (const s of D.API || []) for (const [n, r, x, e] of s.acts || []) if (/no handler/.test(x || '')) add({ sec: 'API', ref: `${s.root}/${n}`, kind: 'review', title: `Action ${n} has no handler`, why: `Declared on ${e || s.svc} and granted to ${r}; a call returns an error or does nothing.`, ev: '', i: 2, l: 3 })

  // untested equivalence classes: from the coverage addon when it ran, otherwise from the test design
  const rows = new Map((D.CLASSES || []).map(r => [r[1], r]))
  const classes = D.COVERAGE?.classes?.filter(c => c.st === 'none' || c.st === 'likely' || c.st === 'fail')
    ?? (D.CLASSES || []).filter(r => !r[6]).map(r => ({ id: r[1], name: r[2], cat: r[0], st: 'none' }))
  for (const c of classes) {
    const r = rows.get(c.id) || []
    add({ sec: D.COVERAGE ? 'COV' : 'TST', also: D.COVERAGE ? ['TST'] : [], ref: c.id, kind: 'test', title: `${c.st === 'fail' ? 'Fix failing test' : 'Test'}: ${c.name}`, why: `${c.cat}. ${r[3] ? 'Input: ' + r[3] + '. ' : ''}${r[4] && r[4] !== 'verify' ? 'Expected: ' + r[4] + '. ' : r[4] ? 'Expected: not known yet, record what the app does. ' : ''}${c.st === 'likely' ? 'An existing test may touch it (name match only).' : c.st === 'fail' ? 'Its test fails.' : 'No test touches it.'}`, ev: '', i: CW[c.cat] ?? 2, l: c.st === 'fail' ? 4 : c.st === 'none' ? 3 : 2, join: false, done: `A passing cds.test whose title starts with "${c.id}".` })
  }
  if (D.DD) add({ sec: 'TST', ref: `${D.DD.action} all-pairs`, kind: 'test', title: `Turn the ${D.DD.rows.length}-case all-pairs suite for ${D.DD.action} into tests`, why: `${D.DD.full} full combinations of ${D.DD.factors.map(f => f[0]).join(', ')}; the seeded all-pairs suite covers every pair of values. The expected outcome per row is in the atlas (TST-B).`, ev: '', i: 3, l: 3, join: false, done: `One parameterised cds.test (test.each) with ${D.DD.rows.length} rows, each asserting the expected outcome.` })

  for (const s of (D.MUTATION?.survivors || []).slice(0, 25)) add({ sec: 'MUT', ref: `${s.file}:${s.line} ${s.mutator}`, kind: 'test', title: `Catch the mutant: ${s.says}`, why: `${s.factLabel ? 'In ' + s.factLabel + '. ' : ''}${s.status === 'NoCoverage' ? 'No test executes this line.' : `Ran ${s.coveredBy.length} test(s), none failed.`}`, ev: `${s.file}:${s.line}`, i: 2, l: s.status === 'NoCoverage' ? 2 : 3, join: false, done: 'A test that fails when this mutation is applied.' })

  for (const r of D.RULES?.rules || []) if (r.status === 'draft' && r.hits.length) add({ sec: 'RLS', ref: r.key, kind: 'review', title: `Review draft rule ${r.key}`, why: `${r.title}. Fires ${r.hits.length} time(s) here: ${r.hits.map(h => h.t).join('; ')}.`, ev: r.hits.map(h => h.ev), i: 2, l: 2, join: false, done: 'The rule is set to "accepted" or deleted in addons/rules/library, with the reason in the PR.' })

  // UI checks from the uitests addon that failed in the running app: the UI does not do what its annotations promise
  for (const c of D.UITESTS?.cases || []) if (c.status === 'failed') add({ sec: 'UIT', also: ['UIS'], ref: c.id.replace(/^UIT:/, ''), kind: 'fix', title: `UI breaks its promise: ${c.title}`, why: `${D.UITESTS.visits.find(v => v.id === c.visit)?.record || ''}: ${c.msg || 'the generated UI check failed'}.`, ev: c.ev, i: 3, l: 4, join: false, done: `The generated UI check ${c.id} passes (node addons/uitests/run.js <out> <app>).` })

  const order = ['fix', 'verify', 'review', 'test']
  return out.sort((a, b) => b.score - a.score || order.indexOf(a.kind) - order.indexOf(b.kind) || a.id.localeCompare(b.id))
}

// one Markdown block per item; the page and the topic file put header + blocks + mode together
function block(x) {
  return [`### ${x.id} · ${KIND[x.kind]} · ${x.band} (impact ${x.i} × likelihood ${x.l})`, x.title,
    x.why ? `Finding: ${x.why}` : '', x.ev.length ? `Evidence: ${x.ev.join(', ')}` : '', `Do: ${DO[x.kind]}`, x.done ? `Done when: ${x.done}` : ''].filter(Boolean).join('\n')
}

function prompt(D) {
  const m = D.META || {}
  return {
    header: `You are working in ${m.url || m.app}${m.commit ? ` (analysed at commit ${String(m.commit).slice(0, 7)})` : ''}, a SAP CAP Node.js app with UI5 / Fiori front ends. The tasks below come from its discovery atlas; each cites file:line evidence in this repository. Read the cited lines before acting. If a finding does not hold any more, say so and skip it. Scope: CAP Node.js only.`,
    modes: {
      plan: { label: 'Plan', text: 'Do not change code yet. For each task: is the finding true (yes / no, with the line you checked), the change you would make, the test that proves it, and the risk of the change. End with the order you suggest.' },
      implement: { label: 'Implement', text: 'Work through the tasks in the order given (highest priority first). For each: make the change, add the test named under "Done when", run the tests, and make one commit per task with the task id in the message. End with a table: task id, result (done / not reproducible / blocked), files changed, test added.' },
      tests: { label: 'Tests only', text: 'Only write tests; do not change app code. For each task add a cds.test that pins the expected behaviour. Where today\'s code behaves differently, keep the expected test as it.skip with the reason, plus one test that pins today\'s behaviour. End with a table: task id, test file, passes today (yes / no).' }
    }
  }
}

function build(D) {
  const list = items(D).map(x => ({ ...x, block: block(x) }))
  const count = b => list.filter(x => x.band === b).length
  return { items: list, counts: { P1: count('P1'), P2: count('P2'), P3: count('P3') }, kinds: KIND, prompt: prompt(D) }
}

module.exports = { build, KIND }
