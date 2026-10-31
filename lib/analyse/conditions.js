// Conditions as structured comparisons instead of text. Two proven parsers, one shape:
//   CQL (where-clauses, UI annotation expressions)  cds.parse.expr -> CXN, CAP's own expression parser
//   JavaScript (if-guards in handlers)              TypeScript syntax tree (lib/extract/handlers/body.js)
// Both become [{ lhs: 'TravelStatus.code', op: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'in', rhs: 'A' | ['A','B'] | 'expr text', literal: bool }]
// so the UI-vs-server comparison (lib/analyse/reflexion-ui.js) compares values, not strings.
// Walkthrough: docs/walkthrough/04-ui-promises.md · Sources: docs/walkthrough/references.md (Model → cds.parse.expr)
const OPS = { '=': '=', '==': '=', '===': '=', '!=': '!=', '<>': '!=', '!==': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=', in: 'in' }
const NEG = { '=': '!=', '!=': '=', '<': '>=', '>=': '<', '>': '<=', '<=': '>', in: 'not in', 'not in': 'in' }

// a CXN operand as { text, value, literal }
function operand(x) {
  if (!x || typeof x !== 'object') return null
  if ('#' in x) return { text: '#' + x['#'], value: x.val ?? x['#'], literal: true, symbol: x['#'] }
  if ('val' in x) return { text: String(x.val), value: x.val, literal: true }
  if (x.list) return { text: x.list.map(l => operand(l)?.text).join(', '), value: x.list.map(l => operand(l)?.value), literal: x.list.every(l => operand(l)?.literal) }
  if (x.ref) return { text: x.ref.filter(r => typeof r === 'string').join('.'), ref: x.ref.filter(r => typeof r === 'string'), param: !!x.param }
  if (x.func) return { text: `${x.func}()` }
  if (x.xpr) return { text: '(…)', xpr: x.xpr }
  return null
}

// every `ref op value` comparison in a CXN token list (nested xpr included); `not` before a comparison flips it
function cxnComparisons(xpr, out = []) {
  if (!Array.isArray(xpr)) return out
  for (let i = 0; i < xpr.length; i++) {
    const t = xpr[i]
    if (t && typeof t === 'object' && t.xpr) cxnComparisons(t.xpr, out)
    const op = typeof xpr[i + 1] === 'string' ? xpr[i + 1].toLowerCase() : null
    if (!op || !OPS[op]) continue
    const l = operand(t), r = operand(xpr[i + 2])
    if (!l || !r) continue
    const [ref, val] = l.ref ? [l, r] : r.ref ? [r, l] : [null, null]
    if (!ref) continue
    const negated = xpr[i - 1] === 'not'
    out.push({ lhs: ref.text, ref: ref.ref, op: negated ? NEG[OPS[op]] : OPS[op], rhs: 'value' in val ? val.value : val.text, literal: !!val.literal, symbol: val.symbol })
    i += 2
  }
  return out
}

// CQL condition text (a where-clause) -> comparisons; template placeholders ${x} become parameters
function cqlComparisons(text, cds = require('@sap/cds')) {
  if (!text) return null
  try { return cxnComparisons(cds.parse.expr(String(text).replace(/\$\{[^}]*\}/g, '?')).xpr || []) } catch { return null }
}

module.exports = { cxnComparisons, cqlComparisons, OPS, NEG }
