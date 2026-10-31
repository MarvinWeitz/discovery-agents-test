// Step 3c · What a handler body does: rejections and messages with their guard, derivations
// (req.data.x = ...), CQL reads and writes with where-clauses, conditional writes, emitted events,
// calls to connected services, native SQL, and helper functions it calls (followed once).
// Walkthrough: docs/walkthrough/03-handlers.md
const ts = require('typescript')
const { QL, SQL_START, HANA_ONLY, REMOTE_CALLS, flat } = require('./vocabulary')
const { cqlComparisons, NEG } = require('../../analyse/conditions')

// F = file context, N = names from names.js, result = counters of the whole run
function makeAnalyser(F, N, result) {
  const { g, rel, sf, line, src, meta } = F
  const { svcVars, functions, resolveEntity } = N
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

  // ---- the same guards as comparisons, read off the syntax tree (lib/analyse/conditions.js shape) ----
  const JS_OPS = { [ts.SyntaxKind.EqualsEqualsEqualsToken]: '=', [ts.SyntaxKind.EqualsEqualsToken]: '=', [ts.SyntaxKind.ExclamationEqualsEqualsToken]: '!=', [ts.SyntaxKind.ExclamationEqualsToken]: '!=',
    [ts.SyntaxKind.LessThanToken]: '<', [ts.SyntaxKind.LessThanEqualsToken]: '<=', [ts.SyntaxKind.GreaterThanToken]: '>', [ts.SyntaxKind.GreaterThanEqualsToken]: '>=' }
  const literal = x => ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) ? { v: x.text } : ts.isNumericLiteral(x) ? { v: Number(x.text) } : x.kind === ts.SyntaxKind.NullKeyword ? { v: null } : x.kind === ts.SyntaxKind.TrueKeyword ? { v: true } : x.kind === ts.SyntaxKind.FalseKeyword ? { v: false } : null
  function jsComparisons(e, neg, out) {
    while (ts.isParenthesizedExpression(e)) e = e.expression
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) return jsComparisons(e.operand, !neg, out)
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) { jsComparisons(e.left, neg, out); jsComparisons(e.right, neg, out); return out }
    if (ts.isBinaryExpression(e) && JS_OPS[e.operatorToken.kind]) {
      const [ref, val] = literal(e.right) ? [e.left, e.right] : literal(e.left) ? [e.right, e.left] : [e.left, e.right]
      const lit = literal(val), op = JS_OPS[e.operatorToken.kind]
      out.push({ lhs: flat(src(ref)), op: neg ? NEG[op] : op, rhs: lit ? lit.v : flat(src(val)), literal: !!lit })
    }
    return out
  }
  function guardConds(node, stop) {
    const levels = [] // innermost first; returned outermost first, like guards()
    for (let n = node, p = node.parent; p && n !== stop; n = p, p = p.parent) {
      if (ts.isIfStatement(p) && n !== p.expression) levels.push(jsComparisons(p.expression, n !== p.thenStatement, []))
      if (ts.isConditionalExpression(p) && n !== p.condition) levels.push(jsComparisons(p.condition, n !== p.whenTrue, []))
      if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && n === p.right) levels.push(jsComparisons(p.left, false, []))
    }
    const out = levels.reverse().flat()
    return out.length ? out : undefined
  }

  // ---- what a function body does: rules, derivations, data access, events, helper calls ----
  function analyse(fn, hid, ctx, seen = new Set()) {
    const facts = { rules: 0 }
    const visit = n => {
      if (ts.isTaggedTemplateExpression(n) && new RegExp(`^${ctx.req}\\.(reject|error)$`).test(src(n.tag))) {
        const rid = `rule:${rel}:${line(n)}`
        g.node(rid, 'Rule', { kind: 'rejection', severity: src(n.tag).split('.').pop(), status: null, guard: guards(n, fn), conds: guardConds(n, fn), message: flat(src(n.template)).replace(/^`|`$/g, ''), target: null, handler: hid }, meta(n))
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
          g.node(rid, 'Rule', { kind: m[2] === 'reject' || m[2] === 'error' ? 'rejection' : 'message', severity: m[2], status, guard: guards(n, fn), conds: guardConds(n, fn), message: msgArg ? flat(src(msgArg)).replace(/^[`'"]|[`'"]$/g, '') : null, target, handler: hid }, meta(n))
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
          const sub = analyse(f, hid, { req: p0 && ts.isIdentifier(p0) ? p0.text : ctx.req, svc: ctx.svc, sql: ctx.sql }, seen)
          facts.rules += sub.rules
        }
        // emit / send on the own service: this.emit('AverageRatings.Changed') is the declared ReviewsService.AverageRatings.Changed
        const recv = ts.isPropertyAccessExpression(n.expression) ? n.expression.expression : null
        const recvName = recv && ts.isIdentifier(recv) ? recv.text : null
        if (/\.(emit|send)$/.test(callee) && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && !(recvName && svcVars[recvName] && svcVars[recvName] !== ctx.svc)) {
          const e = n.arguments[0].text
          const id = ctx.svc && g.nodes.has(`event:${ctx.svc}.${e}`) ? `event:${ctx.svc}.${e}` : `event:${e}`
          g.node(id, 'Event', { name: id.slice(6) })
          g.edge(hid, 'emits', id, { via: callee.split('.').pop() }, meta(n))
        }
        // calls to a connected service: ReviewsService.read('Reviews'), OrdersService.create('Orders'), s4.run(query), db.read(Books)
        if (recvName && svcVars[recvName] && ts.isPropertyAccessExpression(n.expression) && REMOTE_CALLS.includes(n.expression.name.text)) {
          const other = svcVars[recvName], how = n.expression.name.text, a0 = n.arguments[0]
          if (other === 'db') {
            const t = a0 && resolveEntity(a0)
            if (t && how !== 'run') g.edge(hid, ['read', 'get'].includes(how) ? 'reads' : 'writes', t, { via: `db.${how}` }, meta(n))
          } else {
            const to = g.nodes.has(`service:${other}`) && !g.nodes.get(`service:${other}`).props.remote ? `service:${other}` : `remote:${other}`
            if (!g.nodes.has(to)) g.node(to, 'ExternalService', { name: other })
            const entity = a0 && (ts.isStringLiteral(a0) ? a0.text : resolveEntity(a0, other)?.replace(/^\w+:/, '')) || null
            g.edge(hid, 'calls_service', to, { via: how, entity: entity ? entity.replace(other + '.', '') : null, event: ['send', 'emit'].includes(how) && a0 && ts.isStringLiteral(a0) ? a0.text : null }, meta(n))
            result.remoteCalls++
          }
        }
        // native SQL: db.run('Call "sleep"()'), cds.run(`SELECT "seq".NEXTVAL FROM DUMMY`)
        if (/(^|\.)run$/.test(callee) && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]) || ts.isTemplateExpression(n.arguments[0]))) {
          const sql = flat(src(n.arguments[0])).replace(/^[`'"]|[`'"]$/g, '')
          if (SQL_START.test(sql)) ctx.sql.push({ line: line(n), sql: sql.slice(0, 160), hanaOnly: HANA_ONLY.test(sql) })
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
              // .where('ID =', product).and('stock >=', qty) is the fluent form of `ID = product and stock >= qty`
              if (a && ['where', 'and'].includes(name)) cond.push(l.arguments.length > 1 && ts.isStringLiteral(a) ? l.arguments.map((x, i) => i % 2 === 0 && ts.isStringLiteral(x) ? x.text : flat(src(x))).join(' ') : flat(src(a)))
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
            // A write that only happens under a business condition is a rule too (e.g. "TravelStatus.code != 'A'"):
            // the where-clause, parsed by CAP (cds.parse.expr), compares a field that is not a key of the target
            // (key lookups like ID = ${id} only pick the row). Text pattern only when CAP cannot parse the clause.
            const wc = verb !== 'SELECT' && where ? cqlComparisons(where) : null
            const keys = g.nodes.get(t)?.props.keys || ['ID']
            if (verb !== 'SELECT' && where && (wc ? wc.some(c => !keys.includes(c.lhs.split('.').pop()) && c.lhs !== 'UUID') : /!=|<>|>|<|=|null/i.test(where) && !/^\{|UUID\s*=|^\w+$/.test(where))) {
              const rid = `rule:${rel}:${line(n)}`
              if (!g.nodes.has(rid)) { g.node(rid, 'Rule', { kind: 'conditional-write', guard: where, conds: wc || undefined, handler: hid, target: t.replace('svcentity:', '') }, meta(n)); g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++ }
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

  return analyse
}

module.exports = { makeAnalyser }
