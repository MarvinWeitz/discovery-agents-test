// Step 3e · The whole file, handler or not (connectors, lib helpers): calls to connected services,
// native SQL strings, and code that branches on the database kind.
// Walkthrough: docs/walkthrough/03-handlers.md
const ts = require('typescript')
const { SQL_START, HANA_ONLY, REMOTE_CALLS, DB_KINDS, DB_KINDS_IF, flat } = require('./vocabulary')

function fileScan(F, N, fileNode, result) {
  const { g, rel, sf, line, src, meta } = F
  const { svcVars } = N
  // ---- the whole file, handlers or not (connectors, lib helpers): remote calls, native SQL, db-kind branches ----
  const sql = [], branches = []
  sf.forEachChild(function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const r = n.expression.expression, how = n.expression.name.text
      if (ts.isIdentifier(r) && svcVars[r.text] && svcVars[r.text] !== 'db' && REMOTE_CALLS.includes(how)) {
        const other = svcVars[r.text], to = g.nodes.has(`service:${other}`) && !g.nodes.get(`service:${other}`).props.remote ? `service:${other}` : `remote:${other}`
        if (!g.nodes.has(to)) g.node(to, 'ExternalService', { name: other })
        g.edge(`file:${rel}`, 'calls_service', to, { via: how }, meta(n))
      }
      const a0 = n.arguments[0]
      if (how === 'run' && a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0) || ts.isTemplateExpression(a0))) {
        const q = flat(src(a0)).replace(/^[`'"]|[`'"]$/g, '')
        if (SQL_START.test(q)) sql.push({ line: line(n), sql: q.slice(0, 160), hanaOnly: HANA_ONLY.test(q) })
      }
    }
    if (ts.isCallExpression(n) && src(n.expression) === 'cds.run' && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]) || ts.isTemplateExpression(n.arguments[0]))) {
      const q = flat(src(n.arguments[0])).replace(/^[`'"]|[`'"]$/g, '')
      if (SQL_START.test(q) && !sql.some(x => x.line === line(n))) sql.push({ line: line(n), sql: q.slice(0, 160), hanaOnly: HANA_ONLY.test(q) })
    }
    // code that branches on the database: switch (db.kind) { case 'hana': ... }, if (cds.db.kind === 'sqlite')
    if (ts.isSwitchStatement(n) && /kind/i.test(src(n.expression)) && n.caseBlock.clauses.some(c => ts.isCaseClause(c) && DB_KINDS.test(src(c.expression))))
      branches.push({ line: line(n), on: flat(src(n.expression)), cases: n.caseBlock.clauses.filter(ts.isCaseClause).map(c => src(c.expression).replace(/['"]/g, '')) })
    if (ts.isBinaryExpression(n) && /^={2,3}|!={1,2}$/.test(n.operatorToken.getText(sf)) && /kind/i.test(src(n.left)) && DB_KINDS_IF.test(src(n.right)))
      branches.push({ line: line(n), on: flat(src(n.left)), cases: [src(n.right).replace(/['"]/g, '')] })
    n.forEachChild(visit)
  })
  if (sql.length) { fileNode.props.nativeSql = sql; result.nativeSql += sql.length }
  if (branches.length) fileNode.props.dbBranches = branches
}

module.exports = { fileScan }
