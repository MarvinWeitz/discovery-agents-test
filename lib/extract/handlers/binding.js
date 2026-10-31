// Step 3a · Which files implement which service. A file belongs to a service by, in this order:
//   0. CAP's own answer (lib/project/cap.js: @impl, <name>.js|ts next to the .cds file or in lib/ or handlers/,
//      cds.requires.<service>.impl), exactly as cds.serve resolves it
//   1. a class extending cds.Service / cds.ApplicationService named like the service
//   2. @impl on the service, resolved against the .cds file's folder, the project root, or the file's parent
//   3. CAP's convention: <name>.js|ts next to <name>.cds
//   4. same base name as the .cds file that defines the service
// then handed on: a file that calls another local module's export with `this`/`srv` gives it its service.
// Walkthrough: docs/walkthrough/03-handlers.md
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { walk } = require('../../project/files')
const { layout } = require('../../project/layout')
const { cap } = require('../../project/cap')

function serviceFor(file, sf, g, csnDefs, root) {
  const services = g.byType('Service').map(n => n.props.name)
  const byCap = Object.entries(cap(root).impls || {}).find(([s, i]) => i?.file && path.resolve(root, i.file) === file && services.includes(s))
  if (byCap) return byCap[0]
  let cls = null
  sf.forEachChild(function visit(n) {
    if (ts.isClassDeclaration(n) && n.heritageClauses?.some(h => /cds\.(Application)?Service/.test(h.getText(sf)))) cls = n.name?.text
    if (!cls) n.forEachChild(visit)
  })
  if (cls) { const s = services.find(s => s.split('.').pop() === cls); if (s) return s }
  const strip = f => f.replace(/\.(js|ts)$/, '')
  for (const s of services) {
    const impl = csnDefs[s]?.['@impl'], at = csnDefs[s]?.$location?.file
    // CAP resolves @impl against the .cds file's folder, older apps write it relative to the project root
    const cands = impl ? [at && path.resolve(root, path.dirname(at), impl), path.resolve(root, impl), path.resolve(path.dirname(file), '..', impl)].filter(Boolean) : []
    if (cands.some(c => strip(c) === strip(file))) return s
  }
  // CAP convention: srv/cat-service.js next to srv/cat-service.cds
  const sibling = services.find(s => csnDefs[s]?.$location && !csnDefs[s]['@impl'] && strip(path.resolve(root, csnDefs[s].$location.file.replace(/\.cds$/, '.js'))) === strip(file))
  if (sibling) return sibling
  const base = path.basename(file).replace(/\.(js|ts)$/, '')
  return services.find(s => csnDefs[s]?.$location && path.basename(csnDefs[s].$location.file, '.cds') === base)
}

// Service implementations that live outside srv/ (reuse packages next to the app in a monorepo: ../reviews/srv/...)
function implFilesOutside(root, g, csnDefs) {
  const out = []
  for (const s of g.byType('Service')) {
    const at = csnDefs[s.props.name]?.$location?.file
    if (!at || !at.startsWith('..')) continue
    const impl = csnDefs[s.props.name]['@impl']
    const base = impl ? path.resolve(root, path.dirname(at), impl) : path.resolve(root, at.replace(/\.cds$/, ''))
    for (const f of [base, base.replace(/\.(js|ts)$/, '') + '.js', base.replace(/\.(js|ts)$/, '') + '.ts']) if (/\.(js|ts)$/.test(f) && fs.existsSync(f)) { out.push(f); break }
  }
  return out
}

// Local modules a file loads: const x = require('./x'), const { a } = require('../lib/a'), import x from './x'
function localRequires(file, sf) {
  const out = {}
  const resolve = spec => {
    if (!spec.startsWith('.')) return null
    const b = path.resolve(path.dirname(file), spec)
    return [b, b + '.js', b + '.ts', path.join(b, 'index.js'), path.join(b, 'index.ts')].find(f => /\.(js|ts)$/.test(f) && fs.existsSync(f)) || null
  }
  sf.forEachChild(function visit(n) {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(sf) === 'require' && n.initializer.arguments[0] && ts.isStringLiteral(n.initializer.arguments[0])) {
      const f = resolve(n.initializer.arguments[0].text)
      if (f) { if (ts.isIdentifier(n.name)) out[n.name.text] = f; else if (ts.isObjectBindingPattern(n.name)) for (const el of n.name.elements) out[el.name.getText(sf)] = f; else out[`#${f}`] = f }
    }
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const f = resolve(n.moduleSpecifier.text), c = n.importClause
      if (f) { if (c?.name) out[c.name.text] = f; if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) for (const el of c.namedBindings.elements) out[el.name.text] = f; out[`#${f}`] = f }
    }
    n.forEachChild(visit)
  })
  return out
}

// Handler files: every .js/.ts (not .d.ts) under the handler folders, the implementations CAP resolves
// (wherever they are), the custom server.js that cds serve loads, plus implementations found outside by @impl
function handlerFiles(root, g, csn) {
  const c = cap(root)
  const byCap = Object.values(c.impls || {}).filter(i => i?.file).map(i => path.resolve(root, i.file)).concat(c.server ? [path.join(root, c.server)] : [])
  return [...new Set(layout(root).handlerDirs.flatMap(d => walk(d, p => /\.(js|ts)$/.test(p) && !/\.d\.ts$/.test(p))).concat(byCap, implFilesOutside(root, g, csn.definitions)))]
}

// file -> service name, file -> { local name: required file }, with split implementations followed up to 6 hops
function bindServices(root, g, csn, files, parsed) {
  const services = new Map(files.map(f => [f, serviceFor(f, parsed.get(f), g, csn.definitions, root)]))
  const requires = new Map(files.map(f => [f, localRequires(f, parsed.get(f))]))
  // Split implementations: `await poetrySlamsHandler(this)` hands the service to another file's exported function
  for (let changed = true, round = 0; changed && round < 6; round++) {
    changed = false
    for (const f of files) {
      const svc = services.get(f); if (!svc) continue
      const sf = parsed.get(f), req = requires.get(f)
      sf.forEachChild(function visit(n) {
        if (ts.isCallExpression(n) && n.arguments.length) {
          const callee = n.expression.getText(sf).split('.')[0], target = req[callee]
          const a0 = n.arguments[0].getText(sf)
          if (target && services.has(target) && !services.get(target) && (a0 === 'this' || /^(srv|service)$/.test(a0))) { services.set(target, svc); changed = true }
        }
        n.forEachChild(visit)
      })
    }
  }
  return { services, requires }
}

module.exports = { handlerFiles, bindServices, serviceFor, implFilesOutside, localRequires }
