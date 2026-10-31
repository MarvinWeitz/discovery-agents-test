// Step 3 · Handler extractor on the TypeScript syntax tree (works for .js and .ts).
// Beyond registrations it sees
// helper functions called from a handler, every enclosing if-condition of a rule, the where-clause
// of conditional writes, and the HTTP status of each rejection. Facts are confidence "high".
// Per file, in this order:
//   binding.js        which service the file implements (and split implementations)
//   names.js          constants, connected services, entity/action aliases, local functions
//   registrations.js  srv.before/on/after(...) -> Handler nodes; bodies analysed by body.js
//   file-scan.js      remote calls, native SQL and database branches anywhere in the file
// The CAP words the parser knows are in vocabulary.js. Walkthrough: docs/walkthrough/03-handlers.md
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { handlerFiles, bindServices } = require('./binding')
const { fileNames } = require('./names')
const { makeAnalyser } = require('./body')
const { registrations } = require('./registrations')
const { fileScan } = require('./file-scan')

function extractHandlersAst(root, g, csn) {
  const files = handlerFiles(root, g, csn)
  const result = { files: files.length, handlers: 0, helpers: 0, rules: 0, subscriptions: 0, remoteCalls: 0, nativeSql: 0, parser: `typescript ${ts.version}` }
  const parsed = new Map(files.map(file => [file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS)]))
  const { services, requires } = bindServices(root, g, csn, files, parsed)
  for (const file of files) {
    const rel = path.relative(root, file)
    const sf = parsed.get(file)
    const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    const src = n => n.getText(sf)
    const svc = services.get(file)
    const meta = n => ({ evidence: `${rel}:${line(n)}`, source: 'tool:handlers-ast', confidence: 'high' })
    const F = { g, rel, sf, svc, line, src, meta }
    const fileNode = g.node(`file:${rel}`, 'SourceFile', { path: rel, service: svc || null }, { evidence: `${rel}:1`, source: 'tool:handlers-ast' })
    if (svc) g.edge(`service:${svc}`, 'implemented_in', `file:${rel}`, {}, { evidence: `${rel}:1`, source: 'tool:handlers-ast', confidence: 'high' })
    for (const f of new Set(Object.values(requires.get(file)))) if (services.has(f)) g.edge(`file:${rel}`, 'imports', `file:${path.relative(root, f)}`, {}, { evidence: `${rel}:1`, source: 'tool:handlers-ast' })

    const N = fileNames(F)
    registrations(F, N, makeAnalyser(F, N, result), result)
    fileScan(F, N, fileNode, result)
  }
  return result
}

module.exports = { extractHandlersAst }
