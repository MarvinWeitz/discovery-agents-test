// Event names of UI5 controls, read from UI5's own type definitions with the TypeScript parser:
// every `attachXyz(...)` method of a class in @openui5/types (Apache-2.0, bundled with the toolkit) and,
// when installed (it comes with @ui5/linter), @sapui5/types for SAPUI5-only libraries. An XML attribute
// with one of these names whose value names a function is an event handler.
// Walkthrough: docs/walkthrough/05-other-extractors.md · Sources: docs/walkthrough/references.md (UI5)
const fs = require('fs')
const os = require('os')
const path = require('path')
const ts = require('typescript')

function typeDirs() {
  const out = []
  for (const pkg of ['@openui5/types', '@sapui5/types']) {
    try { const pj = require.resolve(`${pkg}/package.json`); out.push({ pkg, version: require(pj).version, dir: path.join(path.dirname(pj), 'types') }) } catch {}
  }
  return out
}

let cached = null
function eventNames() {
  if (cached) return cached
  const dirs = typeDirs()
  if (!dirs.length) return (cached = { names: new Set(), from: 'none' })
  const key = path.join(os.tmpdir(), `ui5-events-${dirs.map(d => d.pkg.replace(/\W/g, '') + d.version).join('-')}.json`)
  try { return (cached = { names: new Set(JSON.parse(fs.readFileSync(key, 'utf8'))), from: dirs.map(d => `${d.pkg}@${d.version}`).join(', ') }) } catch {}
  const names = new Set()
  for (const { dir } of dirs) for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.d.ts'))) {
    const sf = ts.createSourceFile(f, fs.readFileSync(path.join(dir, f), 'utf8'), ts.ScriptTarget.Latest, false)
    const visit = (n, inClass) => {
      if (inClass && ts.isMethodDeclaration(n) && n.name && ts.isIdentifier(n.name) && /^attach[A-Z]/.test(n.name.text)) {
        const e = n.name.text.slice(6); names.add(e[0].toLowerCase() + e.slice(1))
      }
      n.forEachChild(c => visit(c, ts.isClassDeclaration(n)))
    }
    visit(sf, false)
  }
  // attachEvent / attachEventOnce are the generic EventProvider API, not events
  for (const x of ['event', 'eventOnce']) names.delete(x)
  try { fs.writeFileSync(key, JSON.stringify([...names].sort())) } catch {}
  return (cached = { names, from: dirs.map(d => `${d.pkg}@${d.version}`).join(', ') })
}

module.exports = { eventNames }
