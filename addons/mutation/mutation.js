// Reads a Stryker report (mutation-testing-report-schema JSON) and turns it into a quality score:
// per app, per equivalence class (via the generated-test manifest) and a list of surviving mutants
// tied to the rules and handlers of the knowledge graph. A survivor is a bug no test would catch.
const fs = require('fs')
const path = require('path')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }
const KILLED = new Set(['Killed', 'Timeout']), SURVIVED = new Set(['Survived', 'NoCoverage'])

// what the mutant did, in words a reviewer understands
function says(m) {
  const r = String(m.replacement ?? '').replace(/\s+/g, ' ').slice(0, 40)
  return ({
    BlockStatement: 'emptying this block', ConditionalExpression: `making this condition always ${r || 'true/false'}`, EqualityOperator: `flipping this comparison to \`${r}\``,
    LogicalOperator: `swapping \`&&\`/\`||\` (\`${r}\`)`, BooleanLiteral: `inverting \`${r}\``, StringLiteral: 'changing this string', ArithmeticOperator: `changing the arithmetic to \`${r}\``,
    UnaryOperator: `changing the sign (\`${r}\`)`, UpdateOperator: `\`${r}\``, OptionalChaining: 'removing optional chaining', ArrayDeclaration: 'emptying this array', ObjectLiteral: 'emptying this object',
    MethodExpression: `calling \`${r}\` instead`, ArrowFunction: 'making this function return undefined', Regex: 'changing this regex'
  })[m.mutatorName] || `${m.mutatorName} → \`${r}\``
}

function analyse(report, { manifest, runDir } = {}) {
  const tests = {}
  for (const tf of Object.values(report.testFiles || {})) for (const t of tf.tests || []) tests[t.id] = t.name
  const clsOf = new Map((manifest?.tests || []).map(t => [t.full, t.cls]))
  const nodes = runDir ? readJsonl(path.join(runDir, 'graph', 'nodes.jsonl')) : []
  const rules = nodes.filter(n => n.type === 'Rule' || n.type === 'Handler')
  const factAt = (file, line) => {
    const ev = n => String(n.evidence || '').split(':')
    const exact = rules.find(n => n.type === 'Rule' && ev(n)[0] === file && +ev(n)[1] === line)
    if (exact) return exact
    // enclosing handler: the nearest handler registration above the line in the same file
    return rules.filter(n => n.type === 'Handler' && ev(n)[0] === file && +ev(n)[1] <= line).sort((a, b) => +b.evidence.split(':')[1] - +a.evidence.split(':')[1])[0] || null
  }
  const all = [], perClass = {}
  for (const [file, f] of Object.entries(report.files || {})) {
    for (const m of f.mutants || []) {
      const line = m.location?.start?.line
      const fact = factAt(file, line)
      const x = { id: m.id, file, line, mutator: m.mutatorName, replacement: m.replacement, status: m.status, says: says(m), fact: fact?.id || null,
        factLabel: fact ? (fact.type === 'Rule' ? `${fact.props.kind} ${fact.props.message || fact.props.field || ''}`.trim() : `${fact.props.phase} ${(fact.props.events || []).join('/')} ${String(fact.props.target || '').split('.').pop()}`) : null,
        killedBy: (m.killedBy || []).map(t => tests[t] || t), coveredBy: (m.coveredBy || []).map(t => tests[t] || t) }
      all.push(x)
      for (const t of new Set(x.coveredBy)) {
        const cls = clsOf.get(t); if (!cls) continue
        const p = (perClass[cls] ||= { cls, covered: 0, killed: 0 })
        p.covered++; if (x.killedBy.includes(t)) p.killed++
      }
    }
  }
  const valid = all.filter(m => KILLED.has(m.status) || SURVIVED.has(m.status))
  const killed = valid.filter(m => KILLED.has(m.status)).length
  const covered = valid.filter(m => m.status !== 'NoCoverage')
  const score = valid.length ? Math.round(killed / valid.length * 1000) / 10 : null
  const scoreCovered = covered.length ? Math.round(covered.filter(m => KILLED.has(m.status)).length / covered.length * 1000) / 10 : null
  const survivors = all.filter(m => SURVIVED.has(m.status)).sort((a, b) => (b.status === 'Survived') - (a.status === 'Survived') || (b.fact?.startsWith('rule:') ? 1 : 0) - (a.fact?.startsWith('rule:') ? 1 : 0) || a.file.localeCompare(b.file) || a.line - b.line)
  const byStatus = {}; for (const m of all) byStatus[m.status] = (byStatus[m.status] || 0) + 1
  const classes = Object.values(perClass).map(p => ({ ...p, score: Math.round(p.killed / p.covered * 1000) / 10 })).sort((a, b) => a.score - b.score || a.cls.localeCompare(b.cls))
  const files = Object.keys(report.files || {}).map(f => { const ms = all.filter(m => m.file === f && (KILLED.has(m.status) || SURVIVED.has(m.status))); return { file: f, mutants: ms.length, killed: ms.filter(m => KILLED.has(m.status)).length } })
  return { score, scoreCovered, total: all.length, valid: valid.length, killed, byStatus, files, classes, survivors }
}

module.exports = { analyse, says }
