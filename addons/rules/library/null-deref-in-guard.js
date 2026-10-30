// Drafted from agent finding A7 (cap-sflight): deductDiscount's 404 path reads travel.ID from an
// undefined travel, so the caller gets a 500 TypeError instead of the 404.
// Pattern: inside `if (!x) …` (or `if (… && !x)`), the branch reads a property of x.
const ts = require('typescript')

module.exports = {
  key: 'null-deref-in-guard',
  title: 'Error path reads a property of the value it just found missing',
  status: 'draft',
  from: 'agent finding A7 (cap-sflight, 2026-10-29)',
  i: 2, l: 3, lay: 'Node',
  test: 'Call the operation so the guarded value is missing (e.g. a deleted key); expect the intended 4xx, not 500.',
  detect({ files }) {
    const out = []
    for (const f of files.filter(f => /\.(js|ts)$/.test(f.path))) {
      const sf = ts.createSourceFile(f.path, f.text, ts.ScriptTarget.Latest, true, f.path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS)
      const negated = e => {
        if (ts.isParenthesizedExpression(e)) return negated(e.expression)
        if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken && ts.isIdentifier(e.operand)) return [e.operand.text]
        if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return [...negated(e.left), ...negated(e.right)]
        return []
      }
      const visit = n => {
        if (ts.isIfStatement(n)) {
          for (const v of negated(n.expression)) {
            const find = m => {
              if (ts.isPropertyAccessExpression(m) && ts.isIdentifier(m.expression) && m.expression.text === v && !m.questionDotToken) return m
              return ts.forEachChild(m, find)
            }
            const hit = find(n.thenStatement)
            if (hit) {
              const line = sf.getLineAndCharacterOfPosition(hit.getStart()).line + 1
              out.push({ ev: `${f.path}:${line}`, t: `${v}.${hit.name.text} read where ${v} is missing`, d: `\`if (!${v})\` at ${f.path}:${line} then reads \`${v}.${hit.name.text}\`. ${v} is null or undefined on that path, so the request fails with a TypeError (HTTP 500) instead of the intended error.` })
            }
          }
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
    }
    return out
  }
}
