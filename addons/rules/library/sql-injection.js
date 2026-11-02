// From the stress corpus (seeds sql-injection-native, sql-injection-cql-string): request data pasted into a SQL
// or CQL string. cds.run(`... '${req.data.q}'`) and SELECT.from(X).where(`name like '%${q}%'`) both parse the
// input as query text, so a quote in it changes the query (proven at runtime in the corpus: UNION reads other
// tables). CAP's safe forms bind values: .where({ name: { like: q } }), tagged templates SELECT`...${q}`,
// or cds.run(sql, [values]).
// Taint: req.data / req.params / req.query / req.headers / msg.data, and variables assigned from them in the file.
const ts = require('typescript')
const SINK = /(^|\.)(run|where|having|orderBy|groupBy|columns|search)$|^cds\.parse\.(expr|xpr|cql|cxn)$|^(CQL|cds\.ql)$/
const SOURCE = /\b(req|request|msg)\.(data|params|query|headers|_\.req)\b/
module.exports = {
  key: 'sql-injection',
  title: 'Request data concatenated into a SQL or CQL string',
  status: 'draft',
  from: 'stress corpus (2026-11-01): native SQL and CQL where strings built from req.data',
  i: 5, l: 3, lay: 'Node',
  test: "Send a value containing a quote (x' OR '1'='1, or a UNION) and expect a 400 or an empty result, never other rows.",
  detect({ files }) {
    const out = []
    for (const f of files.filter(f => /\.[cm]?[jt]s$/.test(f.path) && /\$\{|\+/.test(f.text) && /req|msg/.test(f.text))) {
      const sf = ts.createSourceFile(f.path, f.text, ts.ScriptTarget.Latest, true, f.path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS)
      const src = n => n.getText(sf)
      // tainted names: const { q } = req.data, const q = req.data.q, let s = `...${q}` (to a fixpoint)
      const tainted = new Set()
      const isTainted = n => !!n && (SOURCE.test(src(n)) || [...tainted].some(t => new RegExp(`(^|[^\\w$.])${t.replace(/\$/g, '\\$')}\\b`).test(src(n))))
      for (let changed = true, rounds = 0; changed && rounds < 5; rounds++) {
        changed = false
        sf.forEachChild(function visit(n) {
          if (ts.isVariableDeclaration(n) && n.initializer && isTainted(n.initializer)) {
            const names = ts.isIdentifier(n.name) ? [n.name.text] : (ts.isObjectBindingPattern(n.name) || ts.isArrayBindingPattern(n.name)) ? n.name.elements.filter(e => ts.isBindingElement(e) && ts.isIdentifier(e.name)).map(e => e.name.text) : []
            for (const x of names) if (!tainted.has(x)) { tainted.add(x); changed = true }
          }
          n.forEachChild(visit)
        })
      }
      // a string built from parts: an untagged template with ${...} or a + concatenation
      const built = a => a && (ts.isTemplateExpression(a) ? a.templateSpans.some(s => isTainted(s.expression)) : ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.PlusToken ? isTainted(a) : ts.isIdentifier(a) && ts.isTemplateExpression(decl(a)) ? built(decl(a)) : false)
      const decl = id => { let d = null; sf.forEachChild(function v(n) { if (!d && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === id.text) d = n.initializer; n.forEachChild(v) }); return d }
      sf.forEachChild(function visit(n) {
        if (ts.isCallExpression(n) && SINK.test(src(n.expression).replace(/\s+/g, '')) && n.arguments.length && built(n.arguments[0])) {
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
          const what = src(n.expression).replace(/\s+/g, '').split('.').pop()
          const via = (ts.isTemplateExpression(n.arguments[0]) ? n.arguments[0].templateSpans.map(s => src(s.expression)).filter(x => isTainted({ getText: () => x })) : [src(n.arguments[0])]).slice(0, 2).join(', ')
          out.push({ ev: `${f.path}:${line}`, t: `${what}() runs a string built from request data (${via.slice(0, 60)})`, d: `${f.path}:${line} passes a ${ts.isTemplateExpression(n.arguments[0]) ? 'template string' : 'concatenated string'} with ${via.slice(0, 80)} to ${src(n.expression).replace(/\s+/g, '').slice(-40)}(). A quote in the value changes the query (SQL/CQL injection); bind the value instead (object where, tagged template, or parameters).` })
        }
        n.forEachChild(visit)
      })
    }
    return out
  }
}
