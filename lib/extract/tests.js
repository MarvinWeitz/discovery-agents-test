// Step 5d · Existing tests: which files, how many cases, which mock user they run as, which entities
// they mention (by name, so approximate). Walkthrough: docs/walkthrough/05-other-extractors.md
const fs = require('fs')
const path = require('path')
const { walk, lineOf } = require('../project/files')
const { layout } = require('../project/layout')

// A test file: *.test.js|ts, *.spec.js|ts, or an OPA5 journey under webapp/test
const isTest = p => /(\.test|\.spec)\.(js|ts)$/.test(p) || /webapp[\\/]test[\\/].*Journey\.js$/.test(p)

function extractTests(root, g) {
  const tests = walk(root, isTest)
  const entities = g.byType('ServiceEntity')
  for (const t of tests) {
    const rel = path.relative(root, t)
    if (layout(root).ignored.some(d => rel.startsWith(d))) continue
    const src = fs.readFileSync(t, 'utf8')
    const cases = (src.match(/\b(it|test|opaTest)\s*\(/g) || []).length
    const tid = `test:${rel}`
    const runsAs = [...new Set([...src.matchAll(/auth\s*[:=]\s*\{\s*username\s*:\s*['"`](\w+)/g), ...src.matchAll(/\.auth\s*\(\s*['"`](\w+)/g)].map(m => m[1]))]
    const names = [...src.matchAll(/\b(?:it|test|opaTest)\s*\(\s*(['"`])(.*?)\1/g)].map(m => m[2])
    g.node(tid, 'ExistingTest', { file: rel, cases, kind: /Journey/.test(rel) ? 'ui-opa5' : 'service', runsAs, names }, { evidence: `${rel}:1`, source: 'tool:tests' })
    for (const u of runsAs) g.edge(tid, 'runs_as', `user:${u}`, {}, { evidence: `${rel}:${lineOf(src, u)}`, source: 'tool:tests' })
    for (const e of entities) {
      const short = e.props.name.split('.').pop()
      if (new RegExp(`\\b${short}\\b`).test(src)) g.edge(tid, 'mentions', e.id, {}, { evidence: `${rel}:${lineOf(src, short)}`, source: 'tool:tests', confidence: 'low' })
    }
  }
}

module.exports = { extractTests, isTest }
