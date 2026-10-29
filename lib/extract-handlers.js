// Handler extractor: finds CAP event handler registrations in service implementations
// and the rules, data access, events and remote calls inside each handler body.
// Static text analysis, so facts are marked confidence "medium".
const fs = require('fs')
const path = require('path')

const CRUD = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'NEW', 'EDIT', 'SAVE', 'CANCEL', 'PATCH', 'UPSERT', '*']

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name.startsWith('.')) continue
    const p = path.join(dir, f.name)
    f.isDirectory() ? walk(p, filter, out) : filter(p) && out.push(p)
  }
  return out
}

const lineAt = (src, i) => src.slice(0, i).split('\n').length

// Returns the index of the parenthesis that closes the one at `open`, skipping strings and template literals.
function matchParen(src, open) {
  let depth = 0, q = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') q = c
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return src.length
}

const strings = s => [...s.matchAll(/['"`]([^'"`]+)['"`]/g)].map(m => m[1])

// Condition of the nearest `if (...)` between `from` and `at`, with nested parentheses intact
function guardBefore(src, from, at) {
  const window = src.slice(from, at)
  const i = [...window.matchAll(/\bif\s*\(/g)].pop()
  if (!i) return null
  const open = from + i.index + i[0].length - 1
  return src.slice(open + 1, matchParen(src, open)).replace(/\s+/g, ' ').trim()
}

function serviceFor(file, src, g, csnDefs) {
  const services = g.byType('Service').map(n => n.props.name)
  const cls = src.match(/class\s+(\w+)\s+extends\s+cds\.(Application)?Service/)
  if (cls) { const s = services.find(s => s.split('.').pop() === cls[1]); if (s) return s }
  for (const s of services) {
    const impl = csnDefs[s]?.['@impl']
    if (impl && path.resolve(path.dirname(file), '..', impl).replace(/\.js$/, '') === file.replace(/\.js$/, '')) return s
  }
  const base = path.basename(file, '.js')
  return services.find(s => {
    const def = csnDefs[s]
    return def?.$location && path.basename(def.$location.file, '.cds') === base
  })
}

function extractHandlers(root, g, csn) {
  const files = walk(path.join(root, 'srv'), p => /\.(js|ts)$/.test(p))
  const result = { files: files.length, handlers: 0 }
  for (const file of files) {
    const rel = path.relative(root, file)
    const src = fs.readFileSync(file, 'utf8')
    const svc = serviceFor(file, src, g, csn.definitions)
    g.node(`file:${rel}`, 'SourceFile', { path: rel, service: svc || null }, { evidence: `${rel}:1`, source: 'tool:handlers' })
    if (svc) g.edge(`service:${svc}`, 'implemented_in', `file:${rel}`, {}, { evidence: `${rel}:1`, source: 'tool:handlers', confidence: 'medium' })

    // Local names bound to service entities: const { Incidents } = this.entities
    const aliases = {}
    for (const m of src.matchAll(/const\s*\{([^}]+)\}\s*=\s*(?:this|srv|\w+)\.entities/g))
      for (const a of m[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean)) aliases[a] = a

    // cds-typer imports: import { Booking, BookingSupplement as Supplements } from '#cds-models/TravelService'
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]#cds-models\/([^'"]+)['"]/g))
      for (const part of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
        const [orig, alias] = part.split(/\s+as\s+/)
        aliases[(alias || orig).trim()] = orig.trim()
      }
    // Action references: const { acceptTravel, rejectTravel } = Travel.actions
    const actionAliases = {}
    for (const m of src.matchAll(/const\s*\{([^}]+)\}\s*=\s*(\w+)\.actions/g))
      for (const a of m[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean)) actionAliases[a] = aliases[m[2]] || m[2]

    const resolveEntity = name => {
      if (!name || !svc) return null
      const base = name.replace(/\.drafts$/, '')
      const id = `svcentity:${svc}.${aliases[base] || base}`
      return g.nodes.has(id) ? id : null
    }

    const reg = /\b(this|srv|\w+)\.(before|on|after)\s*\(/g
    let m
    while ((m = reg.exec(src))) {
      if (['cds', 'app', 'process', 'module', 'emitter'].includes(m[1])) continue // lifecycle hooks, not service handlers
      const open = m.index + m[0].length - 1
      const close = matchParen(src, open)
      const call = src.slice(open + 1, close)
      const line = lineAt(src, m.index)
      const ev = { evidence: `${rel}:${line}`, source: 'tool:handlers', confidence: 'medium' }

      // First argument: event(s); second (optional): target entity
      const firstArg = call.match(/^\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`]*`|\w+)/)
      if (!firstArg) continue
      const list = a => a.startsWith('[') ? a.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean) : [a]
      const events = list(firstArg[1]).map(e => e.replace(/['"`]/g, ''))
      const rest = call.slice(firstArg[0].length)
      const targetArg = rest.match(/^\s*,\s*(\[[^\]]*\]|[\w.]+|'[^']*'|"[^"]*")\s*,/)
      const targetNames = targetArg ? list(targetArg[1]).map(t => t.replace(/['"]/g, '')) : []
      const drafts = targetNames.some(t => t.endsWith('.drafts'))
      const targets = [...new Set(targetNames.map(resolveEntity).filter(Boolean))]
      const target = targets[0] || null
      const id = `handler:${rel}:${line}`
      const body = call
      const isCrud = events.every(e => CRUD.includes(e))
      g.node(id, 'Handler', { phase: m[2], events, target: target ? target.replace('svcentity:', '') : null, drafts, service: svc || null, crud: isCrud, file: rel, line }, ev)
      result.handlers++
      for (const t of targets) g.edge(id, 'handles', t, { phase: m[2], events, drafts }, ev)
      if (!targets.length && svc && isCrud) g.edge(id, 'handles', `service:${svc}`, { phase: m[2], events }, ev)
      if (!isCrud) for (const e of events) {
        const owner = actionAliases[e]
        const candidates = [owner && `action:${svc}.${owner}.${e}`, `action:${svc}.${e}`, `event:${svc}.${e}`,
          ...g.byType('Action').filter(a => a.id.startsWith(`action:${svc}.`) && a.id.endsWith(`.${e}`)).map(a => a.id)].filter(Boolean)
        const custom = candidates.find(c => g.nodes.has(c))
        if (custom) g.edge(id, 'handles', custom, { phase: m[2] }, ev)
      }

      // Rules: req.reject / req.error, with the nearest preceding if-condition as the guard
      for (const r of body.matchAll(/req\.(reject|error)\s*(\(|`)/g)) {
        const at = open + 1 + r.index
        const rl = lineAt(src, at)
        const guard = guardBefore(src, Math.max(open, at - 300), at)
        const msgStart = at + r[0].length - 1
        const msg = r[2] === '`' ? src.slice(msgStart + 1, src.indexOf('`', msgStart + 1)) : (strings(src.slice(msgStart, matchParen(src, msgStart)))[0] || null)
        const rid = `rule:${rel}:${rl}`
        g.node(rid, 'Rule', { kind: 'rejection', guard, message: msg, handler: id }, { evidence: `${rel}:${rl}`, source: 'tool:handlers', confidence: 'medium' })
        g.edge(id, 'enforces', rid, {}, { evidence: `${rel}:${rl}`, source: 'tool:handlers', confidence: 'medium' })
      }

      // Derivations: req.data.x = ... (handler changes input data)
      for (const w of body.matchAll(/req\.data\.(\w+)\s*=(?!=)/g)) {
        const wl = lineAt(src, open + 1 + w.index)
        const guard = guardBefore(src, Math.max(open, open + 1 + w.index - 200), open + 1 + w.index)
        const rid = `rule:${rel}:${wl}`
        g.node(rid, 'Rule', { kind: 'derivation', field: w[1], guard, handler: id }, { evidence: `${rel}:${wl}`, source: 'tool:handlers', confidence: 'medium' })
        g.edge(id, 'enforces', rid, {}, { evidence: `${rel}:${wl}`, source: 'tool:handlers', confidence: 'medium' })
      }

      // Data access inside the handler
      for (const q of body.matchAll(/(?<!['"`\w])(SELECT|INSERT|UPSERT|UPDATE|DELETE)(?:\.(?:one|distinct|from|into|entity))?\s*(?:\([^)]*\))?\s*\.?\s*(?:from|into|entity)?\s*\(?\s*([\w.]+)/g)) {
        const ql = lineAt(src, open + 1 + q.index)
        const name = q[2]
        const t = /^req\.(subject|target)$/.test(name) || name === 'req' ? target
          : aliases[name] && svc ? `svcentity:${svc}.${aliases[name]}` : null
        if (t) g.edge(id, q[1] === 'SELECT' ? 'reads' : 'writes', t, { via: q[1] }, { evidence: `${rel}:${ql}`, source: 'tool:handlers', confidence: 'medium' })
      }
      for (const e of body.matchAll(/\.emit\s*\(\s*['"`]([^'"`]+)/g)) {
        const el = lineAt(src, open + 1 + e.index)
        g.node(`event:${e[1]}`, 'Event', { name: e[1] })
        g.edge(id, 'emits', `event:${e[1]}`, {}, { evidence: `${rel}:${el}`, source: 'tool:handlers', confidence: 'medium' })
      }
    }

    // Remote services and messaging anywhere in the file
    for (const c of src.matchAll(/cds\.connect\.to\s*\(\s*['"`]([^'"`]+)/g)) {
      const cl = lineAt(src, c.index)
      g.node(`remote:${c[1]}`, 'ExternalService', { name: c[1] })
      g.edge(`file:${rel}`, 'connects_to', `remote:${c[1]}`, {}, { evidence: `${rel}:${cl}`, source: 'tool:handlers', confidence: 'medium' })
    }
  }
  return result
}

module.exports = { extractHandlers, walk }
