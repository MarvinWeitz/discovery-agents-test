// Handler extractor on the TypeScript syntax tree (works for .js and .ts).
// Same graph contract as extract-handlers.js (regex version), plus what text matching cannot see:
// helper functions called from a handler, every enclosing if-condition of a rule, the where-clause
// of conditional writes, and the HTTP status of each rejection. Facts are confidence "high".
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { walk } = require('./extract-handlers')

const CRUD = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'NEW', 'EDIT', 'SAVE', 'CANCEL', 'PATCH', 'UPSERT', '*']
const QL = ['SELECT', 'INSERT', 'UPSERT', 'UPDATE', 'DELETE']
const PHASES = ['before', 'on', 'after']
const flat = s => s.replace(/\s+/g, ' ').trim()

function serviceFor(file, sf, g, csnDefs) {
  const services = g.byType('Service').map(n => n.props.name)
  let cls = null
  sf.forEachChild(function visit(n) {
    if (ts.isClassDeclaration(n) && n.heritageClauses?.some(h => /cds\.(Application)?Service/.test(h.getText(sf)))) cls = n.name?.text
    if (!cls) n.forEachChild(visit)
  })
  if (cls) { const s = services.find(s => s.split('.').pop() === cls); if (s) return s }
  for (const s of services) {
    const impl = csnDefs[s]?.['@impl']
    if (impl && path.resolve(path.dirname(file), '..', impl).replace(/\.(js|ts)$/, '') === file.replace(/\.(js|ts)$/, '')) return s
  }
  const base = path.basename(file).replace(/\.(js|ts)$/, '')
  return services.find(s => csnDefs[s]?.$location && path.basename(csnDefs[s].$location.file, '.cds') === base)
}

function extractHandlersAst(root, g, csn) {
  const files = walk(path.join(root, 'srv'), p => /\.(js|ts)$/.test(p) && !/\.d\.ts$/.test(p))
  const result = { files: files.length, handlers: 0, helpers: 0, rules: 0, parser: `typescript ${ts.version}` }
  for (const file of files) {
    const rel = path.relative(root, file)
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS)
    const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    const src = n => n.getText(sf)
    const svc = serviceFor(file, sf, g, csn.definitions)
    const meta = n => ({ evidence: `${rel}:${line(n)}`, source: 'tool:handlers-ast', confidence: 'high' })
    g.node(`file:${rel}`, 'SourceFile', { path: rel, service: svc || null }, { evidence: `${rel}:1`, source: 'tool:handlers-ast' })
    if (svc) g.edge(`service:${svc}`, 'implemented_in', `file:${rel}`, {}, { evidence: `${rel}:1`, source: 'tool:handlers-ast', confidence: 'high' })

    // ---- names: entity aliases, action aliases, local functions ----
    const aliases = {}, actionAliases = {}, functions = {}
    const bindNames = (pattern, value) => {
      if (!ts.isObjectBindingPattern(pattern)) return
      for (const el of pattern.elements) {
        const local = el.name.getText(sf), orig = el.propertyName ? el.propertyName.getText(sf) : local
        if (/\.entities$/.test(value)) aliases[local] = orig
        else if (/\.actions$/.test(value)) actionAliases[local] = aliases[value.replace(/\.actions$/, '')] || value.replace(/\.actions$/, '')
      }
    }
    sf.forEachChild(function visit(n) {
      if (ts.isImportDeclaration(n) && /^['"]#cds-models\//.test(src(n.moduleSpecifier)) && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings))
        for (const el of n.importClause.namedBindings.elements) aliases[el.name.text] = (el.propertyName || el.name).text
      if (ts.isVariableDeclaration(n) && n.initializer) {
        bindNames(n.name, src(n.initializer))
        if (ts.isIdentifier(n.name) && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) functions[n.name.text] = n.initializer
      }
      if (ts.isFunctionDeclaration(n) && n.name) functions[n.name.text] = n
      n.forEachChild(visit)
    })
    const resolveEntity = expr => {
      if (!expr || !svc) return null
      const t = src(expr).replace(/\s+/g, '').replace(/^['"`](.*)['"`]$/, '$1')
      const base = t.replace(/\.drafts(\.name)?$/, '').replace(/^.*\./, x => x)
      const name = aliases[base] || base
      const id = `svcentity:${svc}.${name}`
      return g.nodes.has(id) ? id : null
    }

    // ---- CQL chains: SELECT.one(1).from(X).where`...` is nested calls/property accesses/tagged templates ----
    const inner = x => ts.isCallExpression(x) ? x.expression : ts.isTaggedTemplateExpression(x) ? x.tag : ts.isPropertyAccessExpression(x) ? x.expression : null
    function chainOf(n) { const out = []; for (let x = n; x; x = inner(x)) out.push(x); return out }
    const isChainPart = n => { const p = n.parent; return p && ((ts.isPropertyAccessExpression(p) && p.expression === n) || (ts.isCallExpression(p) && p.expression === n) || (ts.isTaggedTemplateExpression(p) && p.tag === n)) }

    // ---- condition stack: every enclosing if/else and && guard between `node` and `stop` ----
    function guards(node, stop) {
      const out = []
      for (let n = node, p = node.parent; p && n !== stop; n = p, p = p.parent) {
        if (ts.isIfStatement(p) && n !== p.expression) out.unshift(n === p.thenStatement ? flat(src(p.expression)) : `!(${flat(src(p.expression))})`)
        if (ts.isConditionalExpression(p) && n !== p.condition) out.unshift(n === p.whenTrue ? flat(src(p.condition)) : `!(${flat(src(p.condition))})`)
        if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && n === p.right) out.unshift(flat(src(p.left)))
      }
      return out.length ? out.join(' && ') : null
    }

    // ---- what a function body does: rules, derivations, data access, events, helper calls ----
    function analyse(fn, hid, ctx, seen = new Set()) {
      const facts = { rules: 0 }
      const visit = n => {
        if (ts.isTaggedTemplateExpression(n) && new RegExp(`^${ctx.req}\\.(reject|error)$`).test(src(n.tag))) {
          const rid = `rule:${rel}:${line(n)}`
          g.node(rid, 'Rule', { kind: 'rejection', severity: src(n.tag).split('.').pop(), status: null, guard: guards(n, fn), message: flat(src(n.template)).replace(/^`|`$/g, ''), target: null, handler: hid }, meta(n))
          g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++
        }
        if (ts.isCallExpression(n)) {
          const callee = src(n.expression)
          // req.reject / req.error / req.warn
          const m = callee.match(/^(\w+)\.(reject|error|warn|info)$/)
          if (m && m[1] === ctx.req) {
            const args = n.arguments
            const status = args[0] && ts.isNumericLiteral(args[0]) ? Number(args[0].text) : null
            const msgArg = args.find(a => ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) || ts.isTemplateExpression(a))
            const target = args.filter(a => ts.isStringLiteral(a)).map(a => a.text).find(t => /^in\/|^\w+$/.test(t) && t !== msgArg?.text) || null
            const rid = `rule:${rel}:${line(n)}`
            g.node(rid, 'Rule', { kind: m[2] === 'reject' || m[2] === 'error' ? 'rejection' : 'message', severity: m[2], status, guard: guards(n, fn), message: msgArg ? flat(src(msgArg)).replace(/^[`'"]|[`'"]$/g, '') : null, target, handler: hid }, meta(n))
            g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++
          }
          // helper call: follow local functions once per handler
          if (ts.isIdentifier(n.expression) && functions[n.expression.text] && !seen.has(n.expression.text)) {
            const name = n.expression.text, f = functions[name]
            seen.add(name)
            const fid = `helper:${rel}:${line(f)}`
            if (!g.nodes.has(fid)) { g.node(fid, 'Helper', { name, file: rel, line: line(f) }, meta(f)); result.helpers++ }
            g.edge(hid, 'calls', fid, {}, meta(n))
            const p0 = f.parameters?.[0]?.name
            const sub = analyse(f, hid, { req: p0 && ts.isIdentifier(p0) ? p0.text : ctx.req }, seen)
            facts.rules += sub.rules
          }
          // emit / send / connect
          if (/\.(emit|send)$/.test(callee) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
            const e = n.arguments[0].text
            g.node(`event:${e}`, 'Event', { name: e })
            g.edge(hid, 'emits', `event:${e}`, { via: callee.split('.').pop() }, meta(n))
          }
          if (callee === 'cds.connect.to' && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
            g.node(`remote:${n.arguments[0].text}`, 'ExternalService', { name: n.arguments[0].text })
            g.edge(`file:${rel}`, 'connects_to', `remote:${n.arguments[0].text}`, {}, meta(n))
          }
          // cds.run(`UPDATE ${X} ...`)
          if (callee === 'cds.run' && n.arguments[0] && ts.isTemplateExpression(n.arguments[0])) {
            const sql = src(n.arguments[0])
            const verb = (sql.match(/^`\s*(SELECT|INSERT|UPSERT|UPDATE|DELETE)/i) || [])[1]
            const outerWhere = flat(sql.split(/\bWHERE\b/i).pop().replace(/`$/, ''))
            n.arguments[0].templateSpans.forEach((span, i) => {
              const t = resolveEntity(span.expression)
              if (t && verb) g.edge(hid, i === 0 && verb.toUpperCase() !== 'SELECT' ? 'writes' : 'reads', t, { via: `cds.run ${verb.toUpperCase()}`, where: i === 0 ? outerWhere : null, sets: i === 0 && /\bSET\s+(\w+)/i.test(sql) ? { [sql.match(/\bSET\s+(\w+)/i)[1]]: 'sql' } : undefined }, meta(n))
            })
          }
        }
        // CQL: SELECT.one.from(X), UPDATE(X).with(...).where`...`, INSERT.into(X): judge the outermost node of each chain
        if ((ts.isCallExpression(n) || ts.isTaggedTemplateExpression(n)) && !isChainPart(n)) {
          const links = chainOf(n)
          const root = links[links.length - 1]
          if (ts.isIdentifier(root) && QL.includes(root.text)) {
            const verb = root.text
            let targetExpr = null, cond = [], sets = {}
            for (const l of links) {
              if (ts.isCallExpression(l)) {
                const name = ts.isIdentifier(l.expression) ? l.expression.text : ts.isPropertyAccessExpression(l.expression) ? l.expression.name.text : null
                const a = l.arguments[0]
                if (a && ['from', 'into', 'entity'].includes(name)) targetExpr = a
                else if (a && name === verb && !ts.isNumericLiteral(a) && !ts.isStringLiteral(a) && !ts.isObjectLiteralExpression(a)) targetExpr = targetExpr || a
                if (a && ['where', 'and'].includes(name)) cond.push(flat(src(a)))
                if (a && ['with', 'set', 'data', 'entries', 'columns'].includes(name) && ts.isObjectLiteralExpression(a) && name !== 'columns')
                  for (const pr of a.properties) if (ts.isPropertyAssignment(pr)) sets[pr.name.getText(sf)] = flat(src(pr.initializer))
              }
              if (ts.isTaggedTemplateExpression(l) && ts.isPropertyAccessExpression(l.tag) && ['where', 'and'].includes(l.tag.name.text)) cond.push(flat(src(l.template)).replace(/^`|`$/g, ''))
              if (ts.isTaggedTemplateExpression(l) && ts.isPropertyAccessExpression(l.tag) && ['with', 'set'].includes(l.tag.name.text)) {
                const m2 = flat(src(l.template)).replace(/^`|`$/g, '').match(/^(\w+)\s*=\s*(.+)$/)
                if (m2) sets[m2[1]] = m2[2]
              }
            }
            const subjectish = targetExpr && new RegExp(`^${ctx.req}\\.(subject|target)$`).test(src(targetExpr))
            const t = subjectish ? ctx.target : resolveEntity(targetExpr)
            const where = cond.length ? cond.reverse().join(' and ') : null
            if (t) {
              g.edge(hid, verb === 'SELECT' ? 'reads' : 'writes', t, { via: verb, where, sets: Object.keys(sets).length ? sets : undefined }, meta(n))
              // A write that only happens under a business condition is a rule too (e.g. "TravelStatus.code != 'A'")
              if (verb !== 'SELECT' && where && /!=|<>|>|<|=|null/i.test(where) && !/^\{|UUID\s*=|^\w+$/.test(where)) {
                const rid = `rule:${rel}:${line(n)}`
                if (!g.nodes.has(rid)) { g.node(rid, 'Rule', { kind: 'conditional-write', guard: where, handler: hid, target: t.replace('svcentity:', '') }, meta(n)); g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++ }
              }
            }
          }
        }
        // derivation: req.data.X = ...
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const lhs = src(n.left).match(new RegExp(`^${ctx.req}\\.data\\.(\\w+)$`))
          if (lhs) {
            const rid = `rule:${rel}:${line(n)}`
            g.node(rid, 'Rule', { kind: 'derivation', field: lhs[1], expr: flat(src(n.right)), guard: guards(n, fn), handler: hid }, meta(n))
            g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++
          }
        }
        // next() call: an `on` handler that delegates to the default implementation
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === ctx.next) ctx.callsNext = true
        n.forEachChild(visit)
      }
      if (fn.body) visit(fn.body)
      return facts
    }

    // ---- registrations: this.before/on/after(event(s), [target(s)], handler) ----
    sf.forEachChild(function visit(n) {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && PHASES.includes(n.expression.name.text)) {
        const recv = src(n.expression.expression)
        if (['cds', 'app', 'process', 'module', 'emitter'].includes(recv)) return n.forEachChild(visit)
        const args = [...n.arguments]
        const fn = args.length && (ts.isArrowFunction(args[args.length - 1]) || ts.isFunctionExpression(args[args.length - 1])) ? args.pop()
          : args.length && ts.isIdentifier(args[args.length - 1]) && functions[args[args.length - 1].text] ? functions[args.pop().text] : null
        if (!fn || !args.length) return n.forEachChild(visit)
        const list = a => ts.isArrayLiteralExpression(a) ? [...a.elements] : [a]
        const events = list(args[0]).map(e => ts.isStringLiteral(e) ? e.text : src(e))
        const targetExprs = args[1] ? list(args[1]) : []
        const drafts = targetExprs.some(t => /\.drafts$/.test(src(t)))
        const targets = [...new Set(targetExprs.map(resolveEntity).filter(Boolean))]
        const target = targets[0] || null
        const isCrud = events.every(e => CRUD.includes(e))
        const id = `handler:${rel}:${line(n)}`
        const p = fn.parameters || []
        const owner = !target && events.map(e => actionAliases[e]).find(Boolean)
        const ownerId = owner && svc && g.nodes.has(`svcentity:${svc}.${owner}`) ? `svcentity:${svc}.${owner}` : null
        const ctx = { req: p[0] && ts.isIdentifier(p[0].name) ? p[0].name.text : 'req', next: p[1] && ts.isIdentifier(p[1].name) ? p[1].name.text : 'next', target: target || ownerId, callsNext: false }
        const fields = (src(fn).match(/\[\s*('[^']+'(?:\s*,\s*'[^']+')*)\s*\]\s*\)\s*\)?\s*$/) || [])[1]
        g.node(id, 'Handler', { phase: n.expression.name.text, events, target: target ? target.replace('svcentity:', '') : null, targets: targets.map(t => t.replace('svcentity:', '')), drafts, service: svc || null, crud: isCrud, file: rel, line: line(n), async: !!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword), fields: fields ? fields.split(',').map(x => x.trim().replace(/'/g, '')) : null }, meta(n))
        result.handlers++
        for (const t of targets) g.edge(id, 'handles', t, { phase: n.expression.name.text, events, drafts }, meta(n))
        if (!targets.length && svc && isCrud) g.edge(id, 'handles', `service:${svc}`, { phase: n.expression.name.text, events }, meta(n))
        if (!isCrud) for (const e of events) {
          const owner = actionAliases[e]
          const cands = [owner && `action:${svc}.${owner}.${e}`, `action:${svc}.${e}`, `event:${svc}.${e}`, ...g.byType('Action').filter(a => a.id.startsWith(`action:${svc}.`) && a.id.endsWith(`.${e}`)).map(a => a.id)].filter(Boolean)
          const hit = cands.find(c => g.nodes.has(c))
          if (hit) g.edge(id, 'handles', hit, { phase: n.expression.name.text }, meta(n))
        }
        result.rules += analyse(fn, id, ctx).rules
        if (ctx.callsNext) g.nodes.get(id).props.delegates = true
        return
      }
      n.forEachChild(visit)
    })
  }
  return result
}

module.exports = { extractHandlersAst }
