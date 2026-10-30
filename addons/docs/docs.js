// Docs from test-backed facts (phase 6). Each sentence is generated from one equivalence class and
// the graph fact behind it, and carries the test that backs it:
//   ✅ verified   a generated test for this class passed in CI (it asserts exactly this behaviour)
//   ◐ exercised  an existing test sends this request, but nothing ties its assertions to the sentence
//   ⬜ unverified no test yet; the sentence is what the code says, not what a run confirmed
// When the behaviour differs from the intended one, the sentence says so and points to the spec test.
const fs = require('fs')
const path = require('path')

const short = s => String(s || '').split('.').pop()
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
const list = a => a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || ''
const VERB = { READ: 'read', CREATE: 'create, edit and delete', UPDATE: 'edit', DELETE: 'delete' }

// one sentence per class: biz (plain words), dev (with the mechanism)
function sentence(c, g) {
  const d = c.dim || {}, ev = c.evidence || null
  if (c.id.startsWith('AUT:')) {
    const v = c.id.split(':').pop(), users = (d.users || []).map(u => u === 'anonymous' ? 'anonymous callers' : u)
    const what = `${VERB[d.op] || `call ${d.op} on`} ${/^\//.test(d.entity) ? `the other entities under ${d.entity}` : d.entity}`
    const can = { y: 'can', n: 'cannot', r: 'can, without any role,', a: 'may (not decidable from the model)' }[v]
    return { biz: `${cap(list(users))} ${can} ${what}.`, dev: `${c.name}: ${v === 'n' ? 'denied (401/403)' : v === 'r' ? 'allowed although the data needs a role' : v === 'a' ? 'unclear from annotations' : 'allowed'} by @requires / @restrict.`, intended: v === 'r' ? 'should be denied (403)' : null }
  }
  if (c.id.startsWith('UIS:') && d.state) {
    const acc = /accepted/.test(c.today || '')
    return { biz: `The app hides "${d.op}" for a ${d.entity} in status ${d.state}; the server ${acc ? 'still accepts it when called directly' : 'also rejects it'}.`, dev: `@Core.OperationAvailable hides ${d.op} for ${d.state}; ${acc ? 'no handler checks the status' : 'a handler rejects it'}.`, intended: acc ? 'server should reject it (4xx)' : null }
  }
  if (c.id.startsWith('STA:')) return { biz: `"${d.op}" on a ${d.entity} in status ${d.state}: ${/rejected/.test(c.today) ? 'refused' : `moves it ${String(c.today).replace('→', 'to')}`}.`, dev: `State machine: ${d.op} from ${d.state} ${c.today}; UI expects ${c.expected}.`, intended: c.today !== c.expected ? `UI expects ${c.expected}` : null }
  if (c.id.startsWith('RUL:')) {
    const r = g?.nodes.get(c.fact)?.props || {}, f = /:f$/.test(c.id)
    if (r.kind === 'rejection') return f ? { biz: `${cap(d.op.toLowerCase())} on ${d.entity} goes through when "${r.message || 'the check'}" does not apply.`, dev: `${c.name}: guard \`${r.guard}\` false → passes.` }
      : { biz: `${cap(d.op.toLowerCase())} on ${d.entity} is refused${r.guard ? ' when ' + plain(r.guard) : ''}: "${(r.message || '').replace(/\$\{[^}]*\}/g, '…')}".`, dev: `${c.name}: \`if (${r.guard || 'true'})\` → reject ${r.status || 400}.` }
    if (r.kind === 'derivation') return f ? { biz: `${d.entity}.${r.field} keeps the value sent when ${plain(r.guard)} does not hold.`, dev: `${c.name}.` } : { biz: `The server fills ${d.entity}.${r.field} itself${r.guard ? ' when ' + plain(r.guard) : ''}.`, dev: `${r.field} = \`${r.expr}\`${r.guard ? ` if \`${r.guard}\`` : ''}.` }
    return { biz: `${c.name}.`, dev: `${c.name}: ${c.expected}.` }
  }
  if (c.id.startsWith('CMB:')) return null
  return { biz: `${c.name}: ${c.expected}.`, dev: `${c.name}: ${c.expected}${c.input ? ` (input: ${typeof c.input === 'object' ? JSON.stringify(c.input) : c.input})` : ''}.` }
}
// strips cap-sflight names (travel., TravelStatusCode.); open fix F3 in docs/walkthrough/00-assumptions.md
function plain(guard) { return String(guard || '').replace(/!succeeded && /g, '').replace(/===?/g, 'is').replace(/!==?/g, 'is not').replace(/==\s*null/g, 'is empty').replace(/\btravel\./g, '').replace(/TravelStatusCode\./g, '') }

// facts time: sentences with their class and slice; no test results yet
function build(td, g, runDir) {
  let slices = []
  try { slices = JSON.parse(fs.readFileSync(path.join(runDir, 'slices', 'catalog.json'), 'utf8')) } catch {}
  const members = slices.map(s => ({ id: s.id, name: s.name, seed: short(s.seed), ents: new Set([s.seed, ...(s.subSlices || []).flatMap(x => x.members || [])].filter(m => /^(svc)?entity:/.test(m)).map(short)) }))
  const sliceOf = e => (members.find(s => s.seed === e) || members.find(s => s.ents.has(e)) || { id: 'S00', name: 'Cross-cutting' })
  const out = []
  for (const cat of td.categories) for (const c of cat.classes) {
    const s = sentence(c, g); if (!s) continue
    const sl = sliceOf(c.dim?.entity)
    out.push({ cls: c.id, cat: cat.n, slice: sl.id, sliceName: sl.name, entity: c.dim?.entity || '', ...s, ev: c.evidence || (g?.nodes.get(c.fact)?.evidence) || null })
  }
  return { sentences: out }
}

// after tests: attach backing
function back(docs, manifest, results, coverage) {
  const byFull = new Map()
  for (const s of results?.generated?.testResults || []) for (const a of s.assertionResults) byFull.set(a.fullName, a.status)
  const tests = {}, num = new Map()
  ;(manifest?.tests || []).forEach((t, i) => { num.set(t.full, `T-${i + 1}`); (tests[t.cls] ||= []).push({ ...t, n: `T-${i + 1}`, status: byFull.get(t.full) || null }) })
  const cov = new Map((coverage?.classes || []).map(c => [c.cls ?? c.id, c]))
  for (const s of docs.sentences) {
    const ts = tests[s.cls] || [], today = ts.filter(t => t.kind === 'today'), spec = ts.find(t => t.kind === 'spec')
    const ok = today.length && today.every(t => t.status === 'passed'), failed = today.some(t => t.status === 'failed')
    s.back = failed ? 'broken' : ok ? 'verified' : cov.get(s.cls)?.request?.length ? 'exercised' : 'unverified'
    s.tests = today.map(t => ({ n: t.n, title: t.title, file: t.file, status: t.status }))
    s.exercise = cov.get(s.cls)?.request || []
    s.spec = spec ? { n: spec.n, title: spec.title } : null
  }
  const n = k => docs.sentences.filter(s => s.back === k).length
  docs.counts = { verified: n('verified'), exercised: n('exercised'), unverified: n('unverified'), broken: n('broken'), total: docs.sentences.length }
  docs.ran = !!results?.generated
  return docs
}

const ICON = { verified: '✅', exercised: '◐', unverified: '⬜', broken: '❌' }
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

function write(docs, outDir, meta = {}) {
  const dir = path.join(outDir, 'docs'); fs.mkdirSync(dir, { recursive: true })
  const slices = [...new Map(docs.sentences.map(s => [s.slice, s.sliceName]))].sort()
  const files = []
  for (const [id, name] of slices) {
    const S = docs.sentences.filter(s => s.slice === id)
    const file = `${id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}.md`
    const ents = [...new Set(S.map(s => s.entity))]
    const v = S.filter(s => s.back === 'verified')
    const L = ['---', `app: ${meta.app || ''}`, `slice: ${id}`, `title: ${name}`, `verified: ${v.length}`, `sentences: ${S.length}`, `results: ${docs.ran ? 'CI test run' : 'none (static)'}`, 'generator: cap-discovery-toolkit addons/docs', '---', '',
      `# ${name}`, '', `${v.length} of ${S.length} statements are backed by a passing test${docs.ran ? '' : ' (no test results in this run: everything is unverified until CI runs the tests)'}. ${ICON.verified} verified · ${ICON.exercised} an existing test exercises it, not asserted · ${ICON.unverified} unverified · ${ICON.broken} its test fails.`, '',
      '## For business', '', 'What the application does today, confirmed by tests.', '']
    for (const e of ents) {
      const es = S.filter(s => s.entity === e && s.back === 'verified'); if (!es.length) continue
      L.push(`### ${e}`, '', ...es.map(s => `- ${s.biz}${s.cls.startsWith('AUT:') ? ` (tested as ${s.tests.map(t => (t.title.match(/ as (\w+) →/) || [])[1]).filter(Boolean).join(', ')})` : ''}${s.intended ? ` _(differs from the intended behaviour: ${s.intended})_` : ''} ${ICON.verified} ${s.tests.map(t => t.n).join(', ')}`), '')
    }
    if (!v.length) L.push('_Nothing in this area is confirmed by a test yet._', '')
    const uv = S.filter(s => s.back !== 'verified')
    if (uv.length) L.push(`<details><summary>${uv.length} statements not yet confirmed by a test</summary>`, '', ...uv.map(s => `- ${ICON[s.back]} ${s.biz}`), '', '</details>', '')
    L.push('## For developers', '', 'How each statement is implemented, with evidence in the repository.', '', '| | Statement | Mechanism | Evidence |', '| --- | --- | --- | --- |',
      ...S.map(s => `| ${ICON[s.back]} | ${cell(s.biz)} | ${cell(s.dev)} | ${s.ev ? '`' + s.ev + '`' : ''} |`), '')
    L.push('## For testers', '', 'Which test backs which statement, and what is missing.', '', '| | Class | Test | Status | Intended behaviour |', '| --- | --- | --- | --- | --- |',
      ...S.map(s => `| ${ICON[s.back]} | \`${cell(s.cls)}\` | ${cell(s.tests.map(t => `${t.n} ${t.title}`).join('; ') || (s.exercise.length ? 'existing: ' + s.exercise.join(', ') : 'none'))} | ${s.tests.map(t => t.status || 'not run').join(', ') || '–'} | ${cell(s.intended ? `${s.intended}${s.spec ? ` (spec ${s.spec.n}, it.skip)` : ''}` : '')} |`), '')
    fs.writeFileSync(path.join(dir, file), L.join('\n'))
    files.push({ id, name, file, verified: v.length, total: S.length })
  }
  const c = docs.counts
  fs.writeFileSync(path.join(dir, 'README.md'), ['---', `app: ${meta.app || ''}`, 'generator: cap-discovery-toolkit addons/docs', '---', '', `# ${meta.title ? meta.title.replace(/ Discovery Atlas$/, '') : 'Application'} documentation`, '',
    `Generated only from facts in the knowledge graph. ${c.verified} of ${c.total} statements are backed by a passing test (${ICON.verified}), ${c.exercised} are exercised by an existing test without a matching assertion (${ICON.exercised}), ${c.unverified} are unverified (${ICON.unverified})${c.broken ? `, ${c.broken} have a failing test (${ICON.broken})` : ''}. Rerun after every CI test run: a statement whose test fails or disappears loses its ✅.`, '',
    '| Feature | Verified | Statements | File |', '| --- | --- | --- | --- |', ...files.map(f => `| ${f.id} ${f.name} | ${f.verified} | ${f.total} | [${f.file}](${f.file}) |`), '',
    'Each file has three levels: **For business** (confirmed behaviour in plain words), **For developers** (mechanism and `file:line`), **For testers** (class, test, status, gaps).', ''].join('\n'))
  return files
}

module.exports = { build, back, write, ICON }
