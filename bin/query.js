#!/usr/bin/env node
// Questions across the step products, answered in Markdown (for people and agents):
//   node bin/query.js <out> impact <Entity|Service.Entity|handler file:line> [--depth 3] [--assoc]
//   node bin/query.js <out> who-can "<operation text>"      e.g. "Travel DELETE", "deductDiscount"
//   node bin/query.js <out> tests-for <file[:line]>          tests that reach that code (graph + coverage)
// Reads <out>/run/graph and atlas-data.json; no app install needed. Walkthrough: docs/walkthrough/14-step-products.md
const path = require('path')
const { ctx } = require('../lib/products/ctx')
const I = require('../lib/products/impact')
const { table } = require('../lib/products/md')

const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--depth')
const [out, cmd, ...rest] = pos
const q = rest.join(' ')
if (!out || !cmd || !q) { console.error('usage: query <out> impact|who-can|tests-for <what> [--depth n] [--assoc]'); process.exit(2) }
const C = ctx(path.resolve(out))
const G = I.compact(C.nodes(), C.edges())

function impact() {
  const s = I.find(G, q)
  if (!s) { console.error(`nothing called "${q}" in the graph`); process.exit(1) }
  const depth = +(opt('--depth') || 3)
  return I.markdown(G, s.id, I.impact(G, s.id, { depth, assoc: args.includes('--assoc') }), { depth })
}

function whoCan() {
  const F = C.facts(), R = F.ROLES || [], words = q.toLowerCase().split(/\s+/)
  const rows = (F.AUTH || []).map((r, i) => ({ r, i })).filter(({ r }) => words.every(w => `${r.svc} ${r.op}`.toLowerCase().includes(w)))
  if (!rows.length) return `No operation matches "${q}". Operations: ${(F.AUTH || []).map(r => r.op).slice(0, 12).join('; ')}\n`
  const M = F.MEASURED?.authz, word = { y: 'allowed', n: 'denied', r: 'allowed (open, no role)', a: 'unclear' }
  const v = c => (typeof c === 'object' ? c.v : c)
  return rows.map(({ r, i }) => `## Who can: ${r.svc} ${r.op}\n\n\`${r.ev}\`${r.note ? ` · ${r.note}` : ''}\n\n` + table(['User', 'Static', 'Measured'], R.map((u, j) => { const m = M?.rows?.find(x => x.row === i)?.cells?.[j]; return [u[1], word[v(r.c[j])] || v(r.c[j]), m ? `${m.measured} (HTTP ${m.status})${m.st === 'differ' ? ' differs' : ''}` : 'not measured'] }))).join('\n')
}

function testsFor() {
  const [file, line] = q.split(':')
  const nodes = C.nodes(), edges = C.edges(), byId = C.byId()
  const at = n => +String(n.evidence || '').split(':')[1]
  const inFile = nodes.filter(n => ['Handler', 'Rule', 'Helper'].includes(n.type) && String(n.evidence || '').split(':')[0] === file)
  // the code at that line: an exact rule or helper, else the last handler that starts at or above it
  const target = inFile.find(n => n.evidence === q) || inFile.filter(n => n.type === 'Handler' && (!line || at(n) <= +line)).sort((a, b) => at(b) - at(a))[0]
  const L = [`## Tests for ${q}`, '']
  if (!target) L.push('No handler, rule or helper of the graph sits there.')
  else {
    // rule -> its handler; helper -> the handlers that call it
    const handlers = target.type === 'Handler' ? [target] : edges.filter(e => e.to === target.id && ['enforces', 'calls'].includes(e.rel)).map(e => byId.get(e.from)).filter(Boolean)
    const targets = new Set(handlers.flatMap(h => edges.filter(e => e.from === h.id && ['handles', 'reads', 'writes'].includes(e.rel)).map(e => e.to)))
    const own = edges.filter(e => e.rel === 'mentions' && targets.has(e.to)).map(e => byId.get(e.from)).filter(Boolean)
    const gm = C.generatedManifest()
    const names = [...targets].map(id => id.split('.').pop()).map(n => new RegExp(`\\b${n.replace(/[^A-Za-z0-9_]/g, '')}\\b`))
    const gen = (Array.isArray(gm) ? gm : gm?.tests || []).filter(t => names.some(re => re.test(`${t.cls} ${t.title}`)))
    L.push(`Closest code in the graph: ${target.type} \`${target.evidence}\`, run by ${handlers.map(h => '`' + h.evidence + '`').join(', ') || 'no handler found'} for ${[...targets].map(id => id.split(':').pop()).join(', ') || '?'}.`, '')
    L.push('### Existing tests that call it', '', own.length ? own.map(n => `- ${n.id.split(':').slice(1).join(':')}`).join('\n') + '\n' : '_none_\n')
    L.push('### Generated tests on the same entity', '', gen.length ? gen.slice(0, 20).map(t => `- ${t.title || t.name}`).join('\n') + '\n' : '_none_\n')
  }
  const rules = C.facts().MEASURED?.rules
  if (rules) { const never = rules.never.filter(r => r.ev.startsWith(file)); L.push('', `Measured in CI: ${never.length ? `${never.length} rules in this file are never executed by any test: ${never.map(r => r.ev).join(', ')}` : 'every measured rule in this file is executed by a test'}.`) }
  else L.push('', 'Line coverage per rule comes from a CI run (measured addon).')
  return L.join('\n') + '\n'
}

const fn = { impact, 'who-can': whoCan, 'tests-for': testsFor }[cmd]
if (!fn) { console.error(`unknown question "${cmd}"; use impact, who-can or tests-for`); process.exit(2) }
process.stdout.write(fn())
