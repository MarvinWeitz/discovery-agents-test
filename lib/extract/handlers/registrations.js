// Step 3d · Handler registrations: srv.before/on/after(event(s), [target(s)], handler). Each becomes a
// Handler node linked to the entities, actions or events it handles; its body goes to body.js.
// Walkthrough: docs/walkthrough/03-handlers.md
const ts = require('typescript')
const { CRUD, PHASES, NOT_SERVICES } = require('./vocabulary')

function registrations(F, N, analyse, result) {
  const { g, rel, sf, svc, line, src, meta } = F
  const { receiverService, functions, resolveEntity, actionAliases } = N
  // ---- registrations: this.before/on/after(event(s), [target(s)], handler) ----
  sf.forEachChild(function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && PHASES.includes(n.expression.name.text)) {
      const recv = src(n.expression.expression)
      if (NOT_SERVICES.includes(recv)) return n.forEachChild(visit)
      const own = receiverService(n.expression.expression) // the service this handler is registered on
      const foreign = own && own !== svc
      const args = [...n.arguments]
      let fn = args.length && (ts.isArrowFunction(args[args.length - 1]) || ts.isFunctionExpression(args[args.length - 1])) ? args.pop()
        : args.length && ts.isIdentifier(args[args.length - 1]) && functions[args[args.length - 1].text] ? functions[args.pop().text] : null
      // the handler given as an expression: this.onApprove(.bind(this)), require('./handlers/approve'), a factory call.
      // A method of a class in this file is read like an inline function; anything else is registered without a body.
      let opaque = false
      if (!fn && args.length >= 2 && isHandlerExpr(args[args.length - 1])) { fn = methodOf(args[args.length - 1], sf); opaque = !fn; args.pop() }
      if ((!fn && !opaque) || !args.length) return n.forEachChild(visit)
      const list = a => ts.isArrayLiteralExpression(a) ? [...a.elements] : [a]
      const exprEvents = []
      const events = list(args[0]).flatMap(e => {
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text]
        const vals = ts.isIdentifier(e) && loopValues(e, sf)
        if (vals) return vals
        exprEvents.push(src(e)); return [src(e)]
      })
      const targetExprs = args[1] ? list(args[1]) : []
      const drafts = targetExprs.some(t => /\.drafts$/.test(src(t)))
      const targets = [...new Set(targetExprs.map(t => resolveEntity(t, own)).filter(Boolean))]
      const target = targets[0] || null
      const isCrud = events.every(e => CRUD.includes(e))
      const id = `handler:${rel}:${line(n)}`
      const p = fn?.parameters || []
      const owner = !target && events.map(e => actionAliases[e]).find(Boolean)
      const ownerId = owner && own && g.nodes.has(`svcentity:${own}.${owner}`) ? `svcentity:${own}.${owner}` : null
      const ctx = { req: p[0] && ts.isIdentifier(p[0].name) ? p[0].name.text : 'req', next: p[1] && ts.isIdentifier(p[1].name) ? p[1].name.text : 'next', target: target || ownerId, callsNext: false, svc: own, sql: [] }
      const fields = fn && (src(fn).match(/\[\s*('[^']+'(?:\s*,\s*'[^']+')*)\s*\]\s*\)\s*\)?\s*$/) || [])[1]
      g.node(id, 'Handler', { phase: n.expression.name.text, events, target: target ? target.replace('svcentity:', '') : null, targets: targets.map(t => t.replace('svcentity:', '')), drafts, service: own || null, ...(foreign ? { registeredFrom: svc || rel } : {}), crud: isCrud, file: rel, line: line(n), async: !!fn?.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword), fields: fields ? fields.split(',').map(x => x.trim().replace(/'/g, '')) : null }, meta(n))
      result.handlers++
      for (const t of targets) g.edge(id, 'handles', t, { phase: n.expression.name.text, events, drafts }, meta(n))
      if (!targets.length && own && isCrud && g.nodes.has(`service:${own}`)) g.edge(id, 'handles', `service:${own}`, { phase: n.expression.name.text, events }, meta(n))
      if (!isCrud) for (const e of events) {
        const owner = actionAliases[e]
        const cands = [owner && `action:${own}.${owner}.${e}`, `action:${own}.${e}`, `event:${own}.${e}`, ...g.byType('Action').filter(a => a.id.startsWith(`action:${own}.`) && a.id.endsWith(`.${e}`)).map(a => a.id)].filter(Boolean)
        let hit = cands.find(c => g.nodes.has(c))
        // an event of another service (or a messaging topic) this app listens to
        if (!hit && foreign && !/^\$|^\*$/.test(e)) { hit = `event:${own}.${e}`; g.node(hit, 'Event', { name: `${own}.${e}` }, meta(n)) }
        if (hit) g.edge(id, hit.startsWith('event:') && foreign ? 'subscribes' : 'handles', hit, { phase: n.expression.name.text }, meta(n))
        if (hit?.startsWith('event:') && foreign) result.subscriptions++
      }
      if (exprEvents.length) g.nodes.get(id).props.exprEvents = exprEvents
      if (opaque) g.nodes.get(id).props.opaque = true
      else result.rules += analyse(fn, id, ctx).rules
      if (ctx.callsNext) g.nodes.get(id).props.delegates = true
      if (ctx.sql.length) g.nodes.get(id).props.nativeSql = ctx.sql
      return
    }
    n.forEachChild(visit)
  })
}

// an argument that can be a handler: a function reference, a method (optionally .bind(this)), require(...), a call
const isHandlerExpr = x => ts.isPropertyAccessExpression(x) || ts.isCallExpression(x) || ts.isIdentifier(x) || ts.isElementAccessExpression(x)

// this.onApprove / this.onApprove.bind(this) / Class.prototype.onApprove -> the method declaration in this file
function methodOf(x, sf) {
  if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'bind') x = x.expression.expression
  if (!ts.isPropertyAccessExpression(x)) return null
  const name = x.name.text
  let found = null
  sf.forEachChild(function visit(n) {
    if (found) return
    if ((ts.isMethodDeclaration(n) || ts.isPropertyDeclaration(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === name && n.parent && ts.isClassLike(n.parent)) {
      found = ts.isMethodDeclaration(n) ? n : n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? n.initializer : null
    }
    n.forEachChild(visit)
  })
  return found
}

// the string values a loop variable takes: for (const a of ['x', 'y']), for (const [a, from] of TABLE) with
// const TABLE = [['x', ...], ...], and LIST.forEach(a => ...); null when the values are not literals in this file
function loopValues(id, sf) {
  const name = id.text
  const arrayOf = e => {
    if (ts.isArrayLiteralExpression(e)) return e
    if (!ts.isIdentifier(e)) return null
    let init = null
    sf.forEachChild(function visit(n) { if (!init && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === e.text && n.initializer && ts.isArrayLiteralExpression(n.initializer)) init = n.initializer; n.forEachChild(visit) })
    return init
  }
  const pick = (list, k) => {
    const arr = arrayOf(list); if (!arr) return null
    const vals = arr.elements.map(el => k === null ? el : ts.isArrayLiteralExpression(el) ? el.elements[k] : null).map(el => el && (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) ? el.text : null)
    return vals.length && vals.every(v => v !== null) ? vals : null
  }
  const position = b => {
    if (ts.isIdentifier(b)) return b.text === name ? null : undefined
    if (ts.isArrayBindingPattern(b)) { const k = b.elements.findIndex(el => ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name); return k >= 0 ? k : undefined }
    return undefined
  }
  for (let p = id.parent; p; p = p.parent) {
    if (ts.isForOfStatement(p) && ts.isVariableDeclarationList(p.initializer)) {
      const k = position(p.initializer.declarations[0].name)
      if (k !== undefined) return pick(p.expression, k)
    }
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.parameters.length && ts.isCallExpression(p.parent) && ts.isPropertyAccessExpression(p.parent.expression) && p.parent.expression.name.text === 'forEach') {
      const k = position(p.parameters[0].name)
      if (k !== undefined) return pick(p.parent.expression.expression, k)
    }
  }
  return null
}

module.exports = { registrations }
