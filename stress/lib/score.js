// Scoring: which check produced which finding, which findings are alarms, and how a variant's findings
// compare with its clean base. A seed is detected when every expected check shows up as a new (or changed)
// finding in the variant; anything else new that alarms is noise (a false positive of that check).
const fs = require('fs')
const path = require('path')

// the check (detector) a finding comes from, at the granularity the scorecard reports
function checkOf(f) {
  const d = f.data || {}
  switch (f.kind) {
    case 'risk': return `risk:${String(d.key || f.key || '').split(':')[0]}`
    case 'rule-hit': return `rule:${String(f.source || '').replace(/^rules:/, '')}`
    case 'ui-promise': return `ui-promise:${d.verdict}`
    case 'lint': return `lint:${d.tool}:${d.rule}`
    case 'pattern': return `pattern:${f.title}`
    default: return f.kind
  }
}

// descriptive or "go and measure" findings: never counted as false alarms in a clean app
const ADVISORY = [/^pattern:/, /^authz$/, /^risk:row-level$/, /^risk:inherit$/, /^analysis-limit$/, /^ui-promise:(partial|framework|consistent|enforced|stricter|dynamic|unknown|unimplemented)$/]
const advisory = c => ADVISORY.some(re => re.test(c))
const ALARM_KINDS = new Set(['risk', 'rule-hit', 'native-sql', 'custom-route', 'layer-violation', 'action-without-handler', 'state-transition'])
const isAlarm = f => ['warning', 'critical'].includes(f.severity?.level) || ALARM_KINDS.has(f.kind)

function readRun(out) {
  const dir = path.join(out, 'run', 'findings')
  const jl = f => fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
  const gj = f => { const p = path.join(out, 'run', 'graph', f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [] }
  return { findings: jl('findings.jsonl'), gaps: jl('gaps.jsonl'), nodes: gj('nodes.jsonl'), edges: gj('edges.jsonl') }
}

const sig = f => JSON.stringify([f.title, f.statement, f.severity, f.data, f.status])
const re = x => x instanceof RegExp ? x : new RegExp(x)
const text = f => `${f.title} ${f.statement || f.question || ''} ${JSON.stringify(f.data || {})}`
const files = f => (f.evidence || f.look || []).map(e => e.file)

// does finding/gap f satisfy matcher m ({ check | gap, text, file, key }) ?
function matches(f, m) {
  if (m.check) { const c = checkOf(f); if (m.check.endsWith('*') ? !c.startsWith(m.check.slice(0, -1)) : c !== m.check) return false }
  if (m.gap && f.kind !== m.gap) return false
  if (m.text && !re(m.text).test(text(f))) return false
  if (m.file && !files(f).some(x => re(m.file).test(x))) return false
  return true
}

function graphMatch(run, m) {
  if (m.rel) return run.edges.some(e => e.rel === m.rel && (!m.from || re(m.from).test(e.from)) && (!m.to || re(m.to).test(e.to)))
  if (m.type) return run.nodes.some(n => n.type === m.type && (!m.id || re(m.id).test(n.id)) && (!m.props || Object.entries(m.props).every(([k, v]) => re(v).test(JSON.stringify(n.props?.[k])))))
  return false
}

// base, variant: readRun() results; seed: { expect, also, forbid, graph }
function compare(base, variant, seed) {
  const before = new Map(base.findings.map(f => [f.id, f])), gBefore = new Set(base.gaps.map(g => g.id))
  const fresh = variant.findings.filter(f => !before.has(f.id) || (sig(before.get(f.id)) !== sig(f)))
  const freshGaps = variant.gaps.filter(g => !gBefore.has(g.id))
  const used = new Set()
  const expect = (seed.expect || []).map(m => {
    const pool = m.gap ? freshGaps : (m.anywhere ? variant.findings : fresh)
    const hit = pool.filter(f => matches(f, m))
    hit.forEach(f => used.add(f.id))
    return { ...m, hit: hit.length > 0, ids: hit.map(f => f.id).slice(0, 5) }
  })
  const graph = (seed.graph || []).map(m => ({ ...m, hit: m.absent ? !graphMatch(variant, m) : graphMatch(variant, m) }))
  const allowed = (seed.also || []).map(c => typeof c === 'string' ? { check: c } : c)
  const noise = fresh.filter(f => !used.has(f.id) && isAlarm(f) && !advisory(checkOf(f)) && !allowed.some(m => matches(f, m)))
    .map(f => ({ id: f.id, check: checkOf(f), title: f.title, evidence: f.evidence?.[0] }))
  const forbidden = (seed.forbid || []).flatMap(m => variant.findings.filter(f => matches(f, m)).map(f => ({ id: f.id, check: checkOf(f), title: f.title, evidence: f.evidence?.[0], forbid: true })))
  const lost = base.findings.filter(f => !variant.findings.some(v => v.id === f.id) && isAlarm(f)).map(f => ({ id: f.id, check: checkOf(f), title: f.title }))
  return { expect, graph, noise, forbidden, lost, detected: expect.every(e => e.hit) && graph.every(g => g.hit) }
}

// alarms in a clean app (control): every one that is not advisory and not accepted is a false positive
function controlAlarms(run, accepted = []) {
  return run.findings.filter(f => isAlarm(f) && !advisory(checkOf(f))).map(f => ({ id: f.id, check: checkOf(f), title: f.title, evidence: f.evidence?.[0],
    accepted: accepted.find(a => matches(f, a))?.why || null }))
}

module.exports = { checkOf, isAlarm, advisory, readRun, compare, controlAlarms, matches }
