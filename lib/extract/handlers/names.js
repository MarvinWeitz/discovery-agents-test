// Step 3b · Names inside one file: string constants, connected services (cds.connect.to), entity and
// action aliases, local functions, and how an expression resolves to an entity of the graph.
// Walkthrough: docs/walkthrough/03-handlers.md
const ts = require('typescript')

// F = { g, rel, sf, svc, line, src, meta } for one file (see index.js)
function fileNames(F) {
  const { g, rel, sf, svc, src, meta } = F
  // ---- connected services: const X = await cds.connect.to('Name') / cds.services.Name ----
  const svcVars = {}
  // string constants: const NAME = '...', static PROJECT_SERVICE = '...' (as Class.PROJECT_SERVICE and this.PROJECT_SERVICE)
  const consts = {}
  sf.forEachChild(function visit(n) {
    const str = n.initializer && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer)) ? n.initializer.text : null
    if (str && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) consts[n.name.text] = str
    if (str && ts.isPropertyDeclaration(n) && n.parent && ts.isClassLike(n.parent)) { const k = n.name.getText(sf); consts[`this.${k}`] = str; if (n.parent.name) consts[`${n.parent.name.text}.${k}`] = str }
    n.forEachChild(visit)
  })
  const nameOf = a => a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) ? a.text : consts[src(a).replace(/\s+/g, '')]) || null
  const connectName = init => {
    let x = init; while (x && (ts.isAwaitExpression(x) || ts.isParenthesizedExpression(x))) x = x.expression
    if (x && ts.isCallExpression(x) && src(x.expression) === 'cds.connect.to' && nameOf(x.arguments[0])) return nameOf(x.arguments[0])
    const m = x && src(x).match(/^cds\.services(?:\.(\w+)|\[['"]([\w.]+)['"]\])$/)
    return m ? m[1] || m[2] : null
  }
  sf.forEachChild(function visit(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) { const c = connectName(n.initializer); if (c) svcVars[n.name.text] = c }
    if (ts.isCallExpression(n) && src(n.expression) === 'cds.connect.to' && nameOf(n.arguments[0])) {
      const name = nameOf(n.arguments[0])
      if (name !== 'db') {
        const to = g.nodes.has(`remote:${name}`) ? `remote:${name}` : g.nodes.has(`service:${name}`) ? `service:${name}` : `remote:${name}`
        if (to.startsWith('remote:')) g.node(to, 'ExternalService', { name })
        g.edge(`file:${rel}`, 'connects_to', to, {}, meta(n))
      }
    }
    n.forEachChild(visit)
  })
  // which service a registration's receiver is: `this`/the exported (srv) => this file's service,
  // a connected service variable, or the parameter of X.prepend(srv => ...)
  const receiverService = recv => {
    if (!ts.isIdentifier(recv)) return src(recv) === 'this' ? svc : null
    const name = recv.text
    for (let p = recv.parent; p; p = p.parent) {
      if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p)) && p.parameters.some(q => ts.isIdentifier(q.name) && q.name.text === name)) {
        const call = p.parent
        if (call && ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'prepend') return receiverService(call.expression.expression)
        return svc
      }
    }
    return svcVars[name] || svc
  }

  // ---- names: entity aliases, action aliases, local functions ----
  const aliases = {}, actionAliases = {}, functions = {}, dbAliases = {}
  const bindNames = (pattern, value) => {
    if (!ts.isObjectBindingPattern(pattern)) return
    const dbNs = value.match(/^cds\.entities(?:\s*\(\s*['"]([\w.]*)['"]\s*\))?$/) // const { Books } = cds.entities('sap.capire.bookshop')
    for (const el of pattern.elements) {
      const local = el.name.getText(sf), orig = el.propertyName ? el.propertyName.getText(sf) : local
      if (dbNs) { aliases[local] = orig; dbAliases[local] = dbNs[1] || '' }
      else if (/\.entities$/.test(value)) aliases[local] = orig
      else if (/\.actions$/.test(value)) actionAliases[local] = aliases[value.replace(/\.actions$/, '')] || value.replace(/\.actions$/, '')
    }
  }
  sf.forEachChild(function visit(n) {
    if (ts.isImportDeclaration(n) && /^['"]#cds-models\//.test(src(n.moduleSpecifier)) && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings))
      for (const el of n.importClause.namedBindings.elements) aliases[el.name.text] = (el.propertyName || el.name).text
    if (ts.isVariableDeclaration(n) && n.initializer) {
      bindNames(n.name, src(n.initializer))
      if (ts.isIdentifier(n.name) && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) functions[n.name.text] = n.initializer
    }
    if (ts.isFunctionDeclaration(n) && n.name) functions[n.name.text] = n
    n.forEachChild(visit)
  })
  const resolveEntity = (expr, on = svc) => {
    if (!expr) return null
    const t = src(expr).replace(/\s+/g, '').replace(/^['"`](.*)['"`]$/, '$1')
    const base = t.replace(/\.drafts(\.name)?$/, '').replace(/\/.*$/, '')
    const name = aliases[base] || base
    if (on && g.nodes.has(`svcentity:${on}.${name}`)) return `svcentity:${on}.${name}`
    const ns = dbAliases[base]
    if (ns !== undefined) {
      if (g.nodes.has(`entity:${ns ? ns + '.' : ''}${name}`)) return `entity:${ns ? ns + '.' : ''}${name}`
      const hits = g.byType('Entity').filter(e => e.props.name.endsWith('.' + name) || e.props.name === name)
      if (hits.length === 1) return hits[0].id
    }
    return null
  }

  return { svcVars, consts, nameOf, receiverService, aliases, actionAliases, functions, dbAliases, resolveEntity }
}

module.exports = { fileNames }
