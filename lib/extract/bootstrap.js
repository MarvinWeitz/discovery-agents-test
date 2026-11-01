// Step 5i · Code CAP runs at startup besides the service implementations: the custom server.js
// (server.ts) that cds serve loads, and cds-plugin.js of local plugin packages (lib/project/plugins.js).
//   HttpRoute   express routes and static folders added at bootstrap (F13):
//               cds.on('bootstrap', app => app.post('/x', ...)), app.use('/x', express.static(...)),
//               app.serve('/x').from(...), and the same on an app from express()
//   PluginFile  each local cds-plugin file (F8), with whether it registers handlers and how many routes
// CAP's @requires / @restrict do not protect express routes, so each one is listed as an endpoint.
// Walkthrough: docs/walkthrough/05-other-extractors.md (5i) · Sources: docs/walkthrough/references.md (Runtime)
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { cap } = require('../project/cap')
const { localPlugins } = require('../project/plugins')

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use', 'options', 'head'])
const REGISTER = new Set(['before', 'on', 'after', 'prepend'])

function scan(root, file, g) {
  const rel = path.relative(root, file).split(path.sep).join('/')
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS)
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const text = n => n.getText(sf)
  const str = n => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null
  const apps = new Set()
  let registers = false
  const routes = []
  // pass 1: names that hold the express app: the bootstrap callback's parameter, express() results
  sf.forEachChild(function find(n) {
    if (ts.isCallExpression(n) && /^cds\.(on|once)$/.test(text(n.expression)) && str(n.arguments[0]) === 'bootstrap') {
      const fn = n.arguments[1]
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name)) apps.add(fn.parameters[0].name.text)
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isCallExpression(n.initializer) && /^express$/.test(text(n.initializer.expression))) apps.add(n.name.text)
    n.forEachChild(find)
  })
  // pass 2: routes on those names; handler registrations anywhere
  sf.forEachChild(function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const recv = n.expression.expression, how = n.expression.name.text
      if (REGISTER.has(how) && n.arguments.length >= 2 && !(ts.isIdentifier(recv) && apps.has(recv.text))) registers = true
      if (ts.isIdentifier(recv) && apps.has(recv.text)) {
        const p = str(n.arguments[0])
        if (METHODS.has(how) && p) {
          const isStatic = how === 'use' && n.arguments.slice(1).some(a => /static\s*\(/.test(text(a)))
          routes.push({ method: how === 'use' ? 'use' : how, path: p, kind: isStatic ? 'static' : how === 'use' ? 'middleware' : 'route', line: line(n) })
        }
        if (how === 'serve' && p) routes.push({ method: 'get', path: p, kind: 'static', line: line(n) })
      }
    }
    n.forEachChild(visit)
  })
  if (!g.nodes.has(`file:${rel}`)) g.node(`file:${rel}`, 'SourceFile', { path: rel, service: null }, { evidence: `${rel}:1`, source: 'tool:bootstrap' })
  for (const r of routes) {
    const id = `httproute:${r.method.toUpperCase()} ${r.path}`
    g.node(id, 'HttpRoute', { ...r, file: rel }, { evidence: `${rel}:${r.line}`, source: 'tool:bootstrap', confidence: 'high' })
    g.edge(`file:${rel}`, 'serves', id, {}, { evidence: `${rel}:${r.line}`, source: 'tool:bootstrap' })
  }
  return { rel, routes: routes.length, registers }
}

function extractBootstrap(root, g) {
  const c = cap(root)
  const res = { server: null, plugins: [], routes: 0 }
  if (c.server && fs.existsSync(path.join(root, c.server))) { const s = scan(root, path.join(root, c.server), g); res.server = s.rel; res.routes += s.routes }
  for (const p of localPlugins(root)) {
    const s = scan(root, p.file, g)
    g.node(`plugin:${s.rel}`, 'PluginFile', { path: s.rel, package: p.name, from: p.from, routes: s.routes, registers: s.registers }, { evidence: `${s.rel}:1`, source: 'tool:bootstrap', confidence: 'high' })
    g.edge(`plugin:${s.rel}`, 'implemented_in', `file:${s.rel}`, {}, { evidence: `${s.rel}:1`, source: 'tool:bootstrap' })
    res.plugins.push(s.rel); res.routes += s.routes
  }
  return res
}

module.exports = { extractBootstrap }
