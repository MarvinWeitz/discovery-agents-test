// Diff of two discovery runs (base vs head): knowledge graph, risks, pattern health, UI-vs-server
// verdicts, authorization cells and equivalence-class coverage. Every id is stable for a commit, so
// the diff is clean; nodes whose id carries a line number (rules) are matched when only the line moved.
const fs = require('fs')
const path = require('path')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }
const stable = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v)
const noLine = s => String(s).replace(/:\d+(?=$|:|\b)/g, '')
const short = id => String(id).split(/[:.]/).filter(Boolean).pop()

function load(dir) {
  return { D: readJson(path.join(dir, 'atlas-data.json')) || {}, nodes: readJsonl(path.join(dir, 'run', 'graph', 'nodes.jsonl')), edges: readJsonl(path.join(dir, 'run', 'graph', 'edges.jsonl')) }
}

// ids that embed a line number (rules, handlers) are matched by content, so an inserted line is no change
const hasLine = id => /:\d+(:|$)/.test(id)
const nkey = n => hasLine(n.id) ? `${n.type}|${noLine(n.id)}|${stable({ ...n.props, line: 0 })}` : n.id

function graphDiff(a, b) {
  const A = new Map(a.nodes.map(n => [nkey(n), n])), B = new Map(b.nodes.map(n => [nkey(n), n]))
  let added = [...B].filter(([k]) => !A.has(k)).map(([, n]) => n), removed = [...A].filter(([k]) => !B.has(k)).map(([, n]) => n)
  const keysOf = (p, q) => Object.keys({ ...p, ...q }).filter(x => stable(p[x]) !== stable(q[x]))
  const changed = [...B].filter(([k, n]) => A.has(k) && stable(A.get(k).props) !== stable(n.props))
    .map(([k, n]) => ({ id: n.id, type: n.type, keys: keysOf(A.get(k).props, n.props) }))
  // a line-numbered node whose content changed but whose id stayed is a change, not a removal plus an addition
  const addedById = new Map(added.map(n => [n.id, n]))
  const same = removed.filter(n => addedById.get(n.id)?.type === n.type)
  for (const n of same) changed.push({ id: n.id, type: n.type, keys: keysOf(n.props, addedById.get(n.id).props) })
  const sameIds = new Set(same.map(n => n.id))
  added = added.filter(n => !sameIds.has(n.id)); removed = removed.filter(n => !sameIds.has(n.id))
  const moved = new Map([...B].filter(([k, n]) => A.has(k) && A.get(k).id !== n.id).map(([k, n]) => [A.get(k).id, n.id]))
  const ek = e => `${moved.get(e.from) || e.from}|${e.rel}|${moved.get(e.to) || e.to}|${stable(e.props)}`
  const EA = new Set(a.edges.map(ek)), EB = new Set(b.edges.map(e => `${e.from}|${e.rel}|${e.to}|${stable(e.props)}`))
  const eAdded = b.edges.filter(e => !EA.has(`${e.from}|${e.rel}|${e.to}|${stable(e.props)}`)), eRemoved = a.edges.filter(e => !EB.has(ek(e)))
  return { added, removed, changed, moved: [...moved].map(([f, t]) => ({ from: f, to: t })), eAdded, eRemoved, ids: moved }
}

const rkey = r => r.key || `agent:${r.id}`
function riskDiff(a, b) {
  const A = new Map((a.D.RISKS || []).map(r => [rkey(r), r])), B = new Map((b.D.RISKS || []).map(r => [rkey(r), r]))
  return {
    added: [...B.values()].filter(r => !A.has(rkey(r))),
    resolved: [...A.values()].filter(r => !B.has(rkey(r))),
    rescored: [...B.values()].filter(r => A.has(rkey(r)) && A.get(rkey(r)).i * A.get(rkey(r)).l !== r.i * r.l).map(r => ({ ...r, was: A.get(rkey(r)).i * A.get(rkey(r)).l }))
  }
}

const HR = { gd: 0, wn: 1, cr: 2 }
function patternDiff(a, b) {
  const k = p => `${p.n}|${p.w}`
  const A = new Map((a.D.PATTERNS || []).map(p => [k(p), p])), B = new Map((b.D.PATTERNS || []).map(p => [k(p), p]))
  const byName = (m, n) => [...m.values()].filter(p => p.n === n)
  const breaks = [], fixed = []
  for (const p of B.values()) {
    const old = A.get(k(p)) || byName(A, p.n)[0]
    if ((!old && p.h !== 'gd') || (old && HR[p.h] > HR[old.h])) breaks.push({ ...p, was: old?.h || null })
  }
  for (const p of A.values()) { const now = B.get(k(p)) || byName(B, p.n)[0]; if (p.h !== 'gd' && (!now || HR[now.h] < HR[p.h])) fixed.push({ ...p, now: now?.h || null }) }
  return { breaks, fixed }
}

function parityDiff(a, b) {
  const A = new Map((a.D.PARITY || []).map(p => [p[0], p])), B = new Map((b.D.PARITY || []).map(p => [p[0], p]))
  return [...new Set([...A.keys(), ...B.keys()])].filter(k => A.get(k)?.[3] !== B.get(k)?.[3]).map(k => ({ rule: k, was: A.get(k)?.[3] || null, now: B.get(k)?.[3] || null, ev: (B.get(k) || A.get(k))[4] }))
}

function authDiff(a, b) {
  const users = (b.D.ROLES || []).map(r => r[0])
  const ua = (a.D.ROLES || []).map(r => r[0])
  const v = c => (typeof c === 'string' ? c : c?.v)
  const k = r => `${r.svc}|${r.op}`
  const A = new Map((a.D.AUTH || []).map(r => [k(r), r])), out = []
  for (const r of b.D.AUTH || []) {
    const o = A.get(k(r))
    users.forEach((u, i) => { const was = o ? v(o.c[ua.indexOf(u)]) : null, now = v(r.c[i]); if (was !== now) out.push({ op: `${r.svc}: ${r.op}`, user: u, was, now, ev: r.ev }) })
  }
  for (const r of a.D.AUTH || []) if (!(b.D.AUTH || []).some(x => k(x) === k(r))) out.push({ op: r.op, user: '*', was: 'any', now: null, ev: r.ev })
  return out
}

// class status: coverage addon status if present, otherwise "covered" from the test design
const GOOD = new Set(['tested', 'gen', 'spec'])
function classDiff(a, b, ids) {
  const st = D => {
    if (D.COVERAGE) return new Map(D.COVERAGE.classes.map(c => [c.id, { st: c.st, name: c.name, cat: c.cat }]))
    return new Map((D.CLASSES || []).map(c => [c[1], { st: c[6] ? 'likely' : c[7] ? 'gen' : 'none', name: c[2], cat: c[0] }]))
  }
  const remap = id => { for (const [f, t] of ids) if (id.includes(f + ':') || id.endsWith(f)) return id.replace(f, t); return id }
  const A = new Map([...st(a.D)].map(([id, v]) => [remap(id), v])), B = st(b.D)
  const lost = [], gained = [], added = [], removed = []
  for (const [id, x] of B) { const o = A.get(id); if (!o) added.push({ id, ...x }); else if (GOOD.has(o.st) && !GOOD.has(x.st)) lost.push({ id, ...x, was: o.st }); else if (!GOOD.has(o.st) && GOOD.has(x.st)) gained.push({ id, ...x, was: o.st }) }
  for (const [id, x] of A) if (!B.has(id)) removed.push({ id, ...x, lostTest: GOOD.has(x.st) })
  return { lost, gained, added, removed, coverage: [a.D.COVERAGE ? `${a.D.COVERAGE.pct}%` : null, b.D.COVERAGE ? `${b.D.COVERAGE.pct}%` : null] }
}

function kpiDiff(a, b) {
  const A = new Map((a.D.KPIS || []).map(k => [k[1], k[0]]))
  return (b.D.KPIS || []).map(k => ({ label: k[1], was: A.get(k[1]) ?? null, now: k[0] })).filter(k => k.was !== k.now)
}

function diff(baseDir, headDir) {
  const a = load(baseDir), b = load(headDir)
  const graph = graphDiff(a, b)
  const nodes = new Map([...a.nodes, ...b.nodes, ...graph.removed.map(n => ({ ...n, id: 'base:' + n.id }))].map(n => [n.id, n]))
  return { nodes, base: a.D.META?.commit || null, head: b.D.META?.commit || null, graph, risks: riskDiff(a, b), patterns: patternDiff(a, b), parity: parityDiff(a, b), auth: authDiff(a, b), classes: classDiff(a, b, new Map([...graph.ids, ...graph.removed.filter(n => hasLine(n.id)).map(n => [n.id, n.id + '#removed'])])), kpis: kpiDiff(a, b), _b: b, _a: a }
}

module.exports = { diff, short }
