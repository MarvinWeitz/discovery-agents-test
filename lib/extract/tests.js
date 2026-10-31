// Step 5d · Existing tests: which files, how many cases, which mock user they run as, which entities
// they mention (by name, so approximate). Walkthrough: docs/walkthrough/05-other-extractors.md
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { walk, lineOf } = require('../project/files')
const { layout } = require('../project/layout')

// A test file: *.test.js|ts, *.spec.js|ts, or an OPA5 journey under webapp/test
const isTest = p => /(\.test|\.spec)\.(js|ts)$/.test(p) || /webapp[\\/]test[\\/].*Journey\.js$/.test(p)

// The test files as the app's own Jest lists them (`jest --listTests`: its testMatch, roots and ignore
// patterns), when Jest is installed in the app; plus OPA5 journeys, which Jest does not run. Without an
// installed Jest: the file name pattern above. Sources: docs/walkthrough/references.md (Tests)
function testFiles(root) {
  const jest = [path.join(root, 'node_modules', '.bin', 'jest'), path.join(root, '..', 'node_modules', '.bin', 'jest')].find(f => fs.existsSync(f))
  if (jest) {
    try {
      const listed = JSON.parse(execFileSync(jest, ['--listTests', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }))
      if (Array.isArray(listed)) return { files: [...new Set([...listed, ...walk(root, p => isTest(p) && /Journey\.js$/.test(p))])], by: 'jest --listTests' }
    } catch {}
  }
  return { files: walk(root, isTest), by: 'file name pattern' }
}

function extractTests(root, g) {
  const { files: tests, by } = testFiles(root)
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
  return { files: tests.length, by }
}

module.exports = { extractTests, isTest }
