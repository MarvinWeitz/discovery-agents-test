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
      const fn = args.length && (ts.isArrowFunction(args[args.length - 1]) || ts.isFunctionExpression(args[args.length - 1])) ? args.pop()
        : args.length && ts.isIdentifier(args[args.length - 1]) && functions[args[args.length - 1].text] ? functions[args.pop().text] : null
      if (!fn || !args.length) return n.forEachChild(visit)
      const list = a => ts.isArrayLiteralExpression(a) ? [...a.elements] : [a]
      const events = list(args[0]).map(e => ts.isStringLiteral(e) ? e.text : src(e))
      const targetExprs = args[1] ? list(args[1]) : []
      const drafts = targetExprs.some(t => /\.drafts$/.test(src(t)))
      const targets = [...new Set(targetExprs.map(t => resolveEntity(t, own)).filter(Boolean))]
      const target = targets[0] || null
      const isCrud = events.every(e => CRUD.includes(e))
      const id = `handler:${rel}:${line(n)}`
      const p = fn.parameters || []
      const owner = !target && events.map(e => actionAliases[e]).find(Boolean)
      const ownerId = owner && own && g.nodes.has(`svcentity:${own}.${owner}`) ? `svcentity:${own}.${owner}` : null
      const ctx = { req: p[0] && ts.isIdentifier(p[0].name) ? p[0].name.text : 'req', next: p[1] && ts.isIdentifier(p[1].name) ? p[1].name.text : 'next', target: target || ownerId, callsNext: false, svc: own, sql: [] }
      const fields = (src(fn).match(/\[\s*('[^']+'(?:\s*,\s*'[^']+')*)\s*\]\s*\)\s*\)?\s*$/) || [])[1]
      g.node(id, 'Handler', { phase: n.expression.name.text, events, target: target ? target.replace('svcentity:', '') : null, targets: targets.map(t => t.replace('svcentity:', '')), drafts, service: own || null, ...(foreign ? { registeredFrom: svc || rel } : {}), crud: isCrud, file: rel, line: line(n), async: !!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword), fields: fields ? fields.split(',').map(x => x.trim().replace(/'/g, '')) : null }, meta(n))
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
      result.rules += analyse(fn, id, ctx).rules
      if (ctx.callsNext) g.nodes.get(id).props.delegates = true
      if (ctx.sql.length) g.nodes.get(id).props.nativeSql = ctx.sql
      return
    }
    n.forEachChild(visit)
  })
}

module.exports = { registrations }
