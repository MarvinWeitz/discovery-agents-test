// Addon "docs": documentation generated only from test-backed facts, per feature slice, at three
// levels (business, developer, tester). Written to <out>/docs/ by the pipeline (all unverified) and
// again after CI ran the tests. Off: "docs": false. Remove: delete addons/docs.
const fs = require('fs')
const path = require('path')
const { build, back, write, ICON } = require('./docs')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const manifestOf = out => readJson(path.join(out, 'run', 'tests', 'generated', 'manifest.json'))

function finish(D, out, results) {
  back(D.DOCS, manifestOf(out), results, D.COVERAGE)
  write(D.DOCS, out, { app: D.META.app, title: D.META.title })
  const c = D.DOCS.counts
  D.KPIS = D.KPIS.filter(k => k[1] !== 'doc statements verified').concat([[`${c.verified} / ${c.total}`, 'doc statements verified', c.verified < c.total / 4 ? 'w' : '']])
  fs.mkdirSync(path.join(out, 'pr'), { recursive: true })
  fs.writeFileSync(path.join(out, 'pr', 'docs.md'), [`### Docs from tests`, '', `${ICON.verified} **${c.verified} of ${c.total} documentation statements are backed by a passing test**; ${c.exercised} exercised by an existing test, ${c.unverified} unverified${c.broken ? `, **${c.broken} with a failing test**` : ''}. The docs are in the artifact under \`docs/\`.`, ''].join('\n'))
}

function facts(D, { g, td, runDir, out }) {
  D.DOCS = build(td, g, runDir)
  finish(D, out, null)
}

function afterTests({ out, results }) {
  const file = path.join(out, 'atlas-data.json'), D = readJson(file)
  if (!D?.DOCS) return false
  finish(D, out, results)
  fs.writeFileSync(file, JSON.stringify(D, null, 1))
  return true
}

module.exports = { facts, afterTests }
