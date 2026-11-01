// The findings book: collects findings and gaps while the collectors run, gives each a stable id, and
// links them (a finding raises gaps, a later finding resolves them). Formats: schema/finding.schema.json,
// schema/gap.schema.json. Walkthrough: docs/walkthrough/13-findings-and-gaps.md
const crypto = require('crypto')

const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10)
// stable ids: kind + a key that names the thing, never the run (same code -> same id)
const findingId = (kind, key) => `F-${kind}-${hash(`${kind}|${key}`)}`
const gapId = (kind, key) => `G-${kind}-${hash(`${kind}|${key}`)}`

// "srv/x.js:12" -> { file, line }; anything else (null, "unknown", no line) -> null
function ev(s, quote) {
  if (!s) return null
  if (typeof s === 'object' && s.file) return { file: s.file, line: +s.line || 1, ...(quote || s.quote ? { quote: quote || s.quote } : {}) }
  const m = /^(.+):(\d+)$/.exec(String(s))
  return m ? { file: m[1], line: +m[2], ...(quote ? { quote } : {}) } : null
}
const evs = list => [].concat(list || []).map(x => ev(x)).filter(Boolean).filter((e, i, a) => a.findIndex(o => o.file === e.file && o.line === e.line) === i)

const level = (i, l) => i * l >= 16 ? 'critical' : i * l >= 9 ? 'warning' : 'info'

class Book {
  constructor(stage = 'findings') { this.stage = stage; this.findings = new Map(); this.gaps = new Map() }

  // kind, key, title, statement, and optionally method, source, status, confidence, severity, layer,
  // evidence (strings or objects), subjects, test, data, about, resolves. Returns the id.
  finding(f) {
    const id = f.id || findingId(f.kind, f.key)
    if (this.findings.has(id)) return id
    const out = {
      id, kind: f.kind, title: clip(f.title, 200), statement: f.statement || f.title,
      method: f.method || 'static', source: f.source, status: f.status || 'detected', confidence: f.confidence || 'high',
      ...(f.severity ? { severity: f.severity } : {}), ...(f.layer ? { layer: f.layer } : {}),
      evidence: evs(f.evidence), subjects: [...new Set((f.subjects || []).filter(Boolean))],
      ...(f.test ? { test: f.test } : {}), gaps: [], ...(f.resolves?.length ? { resolves: [...new Set(f.resolves)] } : {}),
      ...(f.about?.length ? { about: [...new Set(f.about)] } : {}), stage: f.stage || this.stage, ...(f.data ? { data: f.data } : {}),
    }
    this.findings.set(id, out)
    return id
  }

  // kind, key, question, why, resolvableBy, priority, and optionally subjects, about (finding ids),
  // look (evidence strings or { file, line, why }), expects, data. Returns the id.
  gap(g) {
    const id = gapId(g.kind, g.key)
    const prev = this.gaps.get(id)
    if (prev) { for (const a of g.about || []) if (!prev.about.includes(a)) prev.about.push(a); return id }
    const look = [].concat(g.look || []).map(l => typeof l === 'object' && l.file ? { file: l.file, ...(l.line ? { line: +l.line } : {}), ...(l.why ? { why: l.why } : {}) } : ev(l)).filter(Boolean)
      .filter((e, i, a) => a.findIndex(o => o.file === e.file && o.line === e.line) === i).map(({ quote, ...l }) => l)
    this.gaps.set(id, {
      id, kind: g.kind, question: g.question, why: g.why, resolvableBy: g.resolvableBy, priority: g.priority || 'medium', status: 'open',
      subjects: [...new Set((g.subjects || []).filter(Boolean))], about: [...new Set(g.about || [])], look,
      ...(g.expects ? { expects: g.expects } : {}), stage: g.stage || this.stage, ...(g.data ? { data: g.data } : {}),
    })
    for (const a of g.about || []) this.findings.get(a)?.gaps.push(id)
    return id
  }

  // a later finding that settles gaps: measured/human -> resolved, ai -> answered (not yet reviewed)
  link() {
    for (const f of this.findings.values()) for (const gid of f.resolves || []) {
      const g = this.gaps.get(gid); if (!g) continue
      ;(g.resolvedBy ||= []).includes(f.id) || g.resolvedBy.push(f.id)
      const s = f.method === 'ai' ? 'answered' : 'resolved'
      if (g.status !== 'resolved') g.status = s
    }
    for (const f of this.findings.values()) f.gaps = [...new Set(f.gaps)]
  }

  list() {
    this.link()
    const order = { critical: 0, warning: 1, info: 2, good: 3 }
    const sev = f => f.severity?.impact ? -(f.severity.impact * f.severity.likelihood) : (order[f.severity?.level] ?? 2) - 10
    return {
      findings: [...this.findings.values()].sort((a, b) => a.kind.localeCompare(b.kind) || sev(a) - sev(b) || a.id.localeCompare(b.id)),
      gaps: [...this.gaps.values()].sort((a, b) => ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
    }
  }
}

const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }

module.exports = { Book, findingId, gapId, ev, evs, level, clip }
