// Handler extractor on the TypeScript syntax tree (works for .js and .ts).
// Same graph contract as extract-handlers.js (regex version), plus what text matching cannot see:
// helper functions called from a handler, every enclosing if-condition of a rule, the where-clause
// of conditional writes, and the HTTP status of each rejection. Facts are confidence "high".
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { walk } = require('./extract-handlers')

const CRUD = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'NEW', 'EDIT', 'SAVE', 'CANCEL', 'PATCH', 'UPSERT', '*']
const QL = ['SELECT', 'INSERT', 'UPSERT', 'UPDATE', 'DELETE']
const PHASES = ['before', 'on', 'after']
const flat = s => s.replace(/\s+/g, ' ').trim()

function serviceFor(file, sf, g, csnDefs, root) {
  const services = g.byType('Service').map(n => n.props.name)
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

const SQL_START = /^\s*(SELECT|INSERT|UPSERT|UPDATE|DELETE|CALL|CREATE|DROP|ALTER|MERGE|WITH|DO\s+BEGIN)\b/i
// statements that only HANA understands (procedures, sequences, DUMMY, SQLScript built-ins)
const HANA_ONLY = /\bCALL\b|NEXTVAL|CURRVAL|\bFROM\s+DUMMY\b|\bSYS\.|SQLSCRIPT|\bDO\s+BEGIN|ADD_(SECONDS|DAYS)|CURRENT_UTCTIMESTAMP|SERIES_GENERATE|TO_NVARCHAR|CONTAINS\s*\(/i
const REMOTE_CALLS = ['read', 'create', 'insert', 'upsert', 'update', 'delete', 'run', 'send', 'emit', 'get', 'post', 'put', 'patch']

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

function extractHandlersAst(root, g, csn) {
  const files = [...new Set(walk(path.join(root, 'srv'), p => /\.(js|ts)$/.test(p) && !/\.d\.ts$/.test(p)).concat(implFilesOutside(root, g, csn.definitions)))]
  const result = { files: files.length, handlers: 0, helpers: 0, rules: 0, subscriptions: 0, remoteCalls: 0, nativeSql: 0, parser: `typescript ${ts.version}` }
  const parsed = new Map(files.map(file => [file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS)]))
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
  for (const file of files) {
    const rel = path.relative(root, file)
    const sf = parsed.get(file)
    const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    const src = n => n.getText(sf)
    const svc = services.get(file)
    const meta = n => ({ evidence: `${rel}:${line(n)}`, source: 'tool:handlers-ast', confidence: 'high' })
    const fileNode = g.node(`file:${rel}`, 'SourceFile', { path: rel, service: svc || null }, { evidence: `${rel}:1`, source: 'tool:handlers-ast' })
    if (svc) g.edge(`service:${svc}`, 'implemented_in', `file:${rel}`, {}, { evidence: `${rel}:1`, source: 'tool:handlers-ast', confidence: 'high' })
    for (const f of new Set(Object.values(requires.get(file)))) if (services.has(f)) g.edge(`file:${rel}`, 'imports', `file:${path.relative(root, f)}`, {}, { evidence: `${rel}:1`, source: 'tool:handlers-ast' })

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

    // ---- CQL chains: SELECT.one(1).from(X).where`...` is nested calls/property accesses/tagged templates ----
    const inner = x => ts.isCallExpression(x) ? x.expression : ts.isTaggedTemplateExpression(x) ? x.tag : ts.isPropertyAccessExpression(x) ? x.expression : null
    function chainOf(n) { const out = []; for (let x = n; x; x = inner(x)) out.push(x); return out }
    const isChainPart = n => { const p = n.parent; return p && ((ts.isPropertyAccessExpression(p) && p.expression === n) || (ts.isCallExpression(p) && p.expression === n) || (ts.isTaggedTemplateExpression(p) && p.tag === n)) }

    // ---- condition stack: every enclosing if/else and && guard between `node` and `stop` ----
    function guards(node, stop) {
      const out = []
      for (let n = node, p = node.parent; p && n !== stop; n = p, p = p.parent) {
        if (ts.isIfStatement(p) && n !== p.expression) out.unshift(n === p.thenStatement ? flat(src(p.expression)) : `!(${flat(src(p.expression))})`)
        if (ts.isConditionalExpression(p) && n !== p.condition) out.unshift(n === p.whenTrue ? flat(src(p.condition)) : `!(${flat(src(p.condition))})`)
        if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && n === p.right) out.unshift(flat(src(p.left)))
      }
      return out.length ? out.join(' && ') : null
    }

    // ---- what a function body does: rules, derivations, data access, events, helper calls ----
    function analyse(fn, hid, ctx, seen = new Set()) {
      const facts = { rules: 0 }
      const visit = n => {
        if (ts.isTaggedTemplateExpression(n) && new RegExp(`^${ctx.req}\\.(reject|error)$`).test(src(n.tag))) {
          const rid = `rule:${rel}:${line(n)}`
          g.node(rid, 'Rule', { kind: 'rejection', severity: src(n.tag).split('.').pop(), status: null, guard: guards(n, fn), message: flat(src(n.template)).replace(/^`|`$/g, ''), target: null, handler: hid }, meta(n))
          g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++
        }
        if (ts.isCallExpression(n)) {
          const callee = src(n.expression)
          // req.reject / req.error / req.warn
          const m = callee.match(/^(\w+)\.(reject|error|warn|info)$/)
          if (m && m[1] === ctx.req) {
            const args = n.arguments
            const status = args[0] && ts.isNumericLiteral(args[0]) ? Number(args[0].text) : null
            const msgArg = args.find(a => ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) || ts.isTemplateExpression(a))
            const target = args.filter(a => ts.isStringLiteral(a)).map(a => a.text).find(t => /^in\/|^\w+$/.test(t) && t !== msgArg?.text) || null
            const rid = `rule:${rel}:${line(n)}`
            g.node(rid, 'Rule', { kind: m[2] === 'reject' || m[2] === 'error' ? 'rejection' : 'message', severity: m[2], status, guard: guards(n, fn), message: msgArg ? flat(src(msgArg)).replace(/^[`'"]|[`'"]$/g, '') : null, target, handler: hid }, meta(n))
            g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++
          }
          // helper call: follow local functions once per handler
          if (ts.isIdentifier(n.expression) && functions[n.expression.text] && !seen.has(n.expression.text)) {
            const name = n.expression.text, f = functions[name]
            seen.add(name)
            const fid = `helper:${rel}:${line(f)}`
            if (!g.nodes.has(fid)) { g.node(fid, 'Helper', { name, file: rel, line: line(f) }, meta(f)); result.helpers++ }
            g.edge(hid, 'calls', fid, {}, meta(n))
            const p0 = f.parameters?.[0]?.name
            const sub = analyse(f, hid, { req: p0 && ts.isIdentifier(p0) ? p0.text : ctx.req, svc: ctx.svc, sql: ctx.sql }, seen)
            facts.rules += sub.rules
          }
          // emit / send on the own service: this.emit('AverageRatings.Changed') is the declared ReviewsService.AverageRatings.Changed
          const recv = ts.isPropertyAccessExpression(n.expression) ? n.expression.expression : null
          const recvName = recv && ts.isIdentifier(recv) ? recv.text : null
          if (/\.(emit|send)$/.test(callee) && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && !(recvName && svcVars[recvName] && svcVars[recvName] !== ctx.svc)) {
            const e = n.arguments[0].text
            const id = ctx.svc && g.nodes.has(`event:${ctx.svc}.${e}`) ? `event:${ctx.svc}.${e}` : `event:${e}`
            g.node(id, 'Event', { name: id.slice(6) })
            g.edge(hid, 'emits', id, { via: callee.split('.').pop() }, meta(n))
          }
          // calls to a connected service: ReviewsService.read('Reviews'), OrdersService.create('Orders'), s4.run(query), db.read(Books)
          if (recvName && svcVars[recvName] && ts.isPropertyAccessExpression(n.expression) && REMOTE_CALLS.includes(n.expression.name.text)) {
            const other = svcVars[recvName], how = n.expression.name.text, a0 = n.arguments[0]
            if (other === 'db') {
              const t = a0 && resolveEntity(a0)
              if (t && how !== 'run') g.edge(hid, ['read', 'get'].includes(how) ? 'reads' : 'writes', t, { via: `db.${how}` }, meta(n))
            } else {
              const to = g.nodes.has(`service:${other}`) && !g.nodes.get(`service:${other}`).props.remote ? `service:${other}` : `remote:${other}`
              if (!g.nodes.has(to)) g.node(to, 'ExternalService', { name: other })
              const entity = a0 && (ts.isStringLiteral(a0) ? a0.text : resolveEntity(a0, other)?.replace(/^\w+:/, '')) || null
              g.edge(hid, 'calls_service', to, { via: how, entity: entity ? entity.replace(other + '.', '') : null, event: ['send', 'emit'].includes(how) && a0 && ts.isStringLiteral(a0) ? a0.text : null }, meta(n))
              result.remoteCalls++
            }
          }
          // native SQL: db.run('Call "sleep"()'), cds.run(`SELECT "seq".NEXTVAL FROM DUMMY`)
          if (/(^|\.)run$/.test(callee) && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]) || ts.isTemplateExpression(n.arguments[0]))) {
            const sql = flat(src(n.arguments[0])).replace(/^[`'"]|[`'"]$/g, '')
            if (SQL_START.test(sql)) ctx.sql.push({ line: line(n), sql: sql.slice(0, 160), hanaOnly: HANA_ONLY.test(sql) })
          }
          // cds.run(`UPDATE ${X} ...`)
          if (callee === 'cds.run' && n.arguments[0] && ts.isTemplateExpression(n.arguments[0])) {
            const sql = src(n.arguments[0])
            const verb = (sql.match(/^`\s*(SELECT|INSERT|UPSERT|UPDATE|DELETE)/i) || [])[1]
            const outerWhere = flat(sql.split(/\bWHERE\b/i).pop().replace(/`$/, ''))
            n.arguments[0].templateSpans.forEach((span, i) => {
              const t = resolveEntity(span.expression)
              if (t && verb) g.edge(hid, i === 0 && verb.toUpperCase() !== 'SELECT' ? 'writes' : 'reads', t, { via: `cds.run ${verb.toUpperCase()}`, where: i === 0 ? outerWhere : null, sets: i === 0 && /\bSET\s+(\w+)/i.test(sql) ? { [sql.match(/\bSET\s+(\w+)/i)[1]]: 'sql' } : undefined }, meta(n))
            })
          }
        }
        // CQL: SELECT.one.from(X), UPDATE(X).with(...).where`...`, INSERT.into(X): judge the outermost node of each chain
        if ((ts.isCallExpression(n) || ts.isTaggedTemplateExpression(n)) && !isChainPart(n)) {
          const links = chainOf(n)
          const root = links[links.length - 1]
          if (ts.isIdentifier(root) && QL.includes(root.text)) {
            const verb = root.text
            let targetExpr = null, cond = [], sets = {}
            for (const l of links) {
              if (ts.isCallExpression(l)) {
                const name = ts.isIdentifier(l.expression) ? l.expression.text : ts.isPropertyAccessExpression(l.expression) ? l.expression.name.text : null
                const a = l.arguments[0]
                if (a && ['from', 'into', 'entity'].includes(name)) targetExpr = a
                else if (a && name === verb && !ts.isNumericLiteral(a) && !ts.isStringLiteral(a) && !ts.isObjectLiteralExpression(a)) targetExpr = targetExpr || a
                // .where('ID =', product).and('stock >=', qty) is the fluent form of `ID = product and stock >= qty`
                if (a && ['where', 'and'].includes(name)) cond.push(l.arguments.length > 1 && ts.isStringLiteral(a) ? l.arguments.map((x, i) => i % 2 === 0 && ts.isStringLiteral(x) ? x.text : flat(src(x))).join(' ') : flat(src(a)))
                if (a && ['with', 'set', 'data', 'entries', 'columns'].includes(name) && ts.isObjectLiteralExpression(a) && name !== 'columns')
                  for (const pr of a.properties) if (ts.isPropertyAssignment(pr)) sets[pr.name.getText(sf)] = flat(src(pr.initializer))
              }
              if (ts.isTaggedTemplateExpression(l) && ts.isPropertyAccessExpression(l.tag) && ['where', 'and'].includes(l.tag.name.text)) cond.push(flat(src(l.template)).replace(/^`|`$/g, ''))
              if (ts.isTaggedTemplateExpression(l) && ts.isPropertyAccessExpression(l.tag) && ['with', 'set'].includes(l.tag.name.text)) {
                const m2 = flat(src(l.template)).replace(/^`|`$/g, '').match(/^(\w+)\s*=\s*(.+)$/)
                if (m2) sets[m2[1]] = m2[2]
              }
            }
            const subjectish = targetExpr && new RegExp(`^${ctx.req}\\.(subject|target)$`).test(src(targetExpr))
            const t = subjectish ? ctx.target : resolveEntity(targetExpr)
            const where = cond.length ? cond.reverse().join(' and ') : null
            if (t) {
              g.edge(hid, verb === 'SELECT' ? 'reads' : 'writes', t, { via: verb, where, sets: Object.keys(sets).length ? sets : undefined }, meta(n))
              // A write that only happens under a business condition is a rule too (e.g. "TravelStatus.code != 'A'")
              if (verb !== 'SELECT' && where && /!=|<>|>|<|=|null/i.test(where) && !/^\{|UUID\s*=|^\w+$/.test(where)) {
                const rid = `rule:${rel}:${line(n)}`
                if (!g.nodes.has(rid)) { g.node(rid, 'Rule', { kind: 'conditional-write', guard: where, handler: hid, target: t.replace('svcentity:', '') }, meta(n)); g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++ }
              }
            }
          }
        }
        // derivation: req.data.X = ...
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const lhs = src(n.left).match(new RegExp(`^${ctx.req}\\.data\\.(\\w+)$`))
          if (lhs) {
            const rid = `rule:${rel}:${line(n)}`
            g.node(rid, 'Rule', { kind: 'derivation', field: lhs[1], expr: flat(src(n.right)), guard: guards(n, fn), handler: hid }, meta(n))
            g.edge(hid, 'enforces', rid, {}, meta(n)); facts.rules++
          }
        }
        // next() call: an `on` handler that delegates to the default implementation
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === ctx.next) ctx.callsNext = true
        n.forEachChild(visit)
      }
      if (fn.body) visit(fn.body)
      return facts
    }

    // ---- registrations: this.before/on/after(event(s), [target(s)], handler) ----
    sf.forEachChild(function visit(n) {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && PHASES.includes(n.expression.name.text)) {
        const recv = src(n.expression.expression)
        if (['cds', 'app', 'process', 'module', 'emitter'].includes(recv)) return n.forEachChild(visit)
        const own = receiverService(n.expression.expression) // the service this handler is registered on
        const foreign = own && own !== svc
        const args = [...n.arguments]
        const fn = args.length && (ts.isArrowFunction(args[args.length - 1]) || ts.isFunctionExpression(args[args.length - 1])) ? args.pop()
          : args.length && ts.isIdentifier(args[args.length - 1]) && functions[args[args.length - 1].text] ? functions[args.pop().text] : null
        if (!fn || !args.length) return n.forEachChild(visit)
        const list = a => ts.isArrayLiteralExpression(a) ? [...a.elements] : [a]
        const events = list(args[0]).map(e => ts.isStringLiteral(e) ? e.text : src(e))
        const targetExprs = args[1] ? list(args[1]) : []
        const drafts = targetExprs.some(t => /\.drafts$/.test(src(t)))
        const targets = [...new Set(targetExprs.map(t => resolveEntity(t, own)).filter(Boolean))]
        const target = targets[0] || null
        const isCrud = events.every(e => CRUD.includes(e))
        const id = `handler:${rel}:${line(n)}`
        const p = fn.parameters || []
        const owner = !target && events.map(e => actionAliases[e]).find(Boolean)
        const ownerId = owner && own && g.nodes.has(`svcentity:${own}.${owner}`) ? `svcentity:${own}.${owner}` : null
        const ctx = { req: p[0] && ts.isIdentifier(p[0].name) ? p[0].name.text : 'req', next: p[1] && ts.isIdentifier(p[1].name) ? p[1].name.text : 'next', target: target || ownerId, callsNext: false, svc: own, sql: [] }
        const fields = (src(fn).match(/\[\s*('[^']+'(?:\s*,\s*'[^']+')*)\s*\]\s*\)\s*\)?\s*$/) || [])[1]
        g.node(id, 'Handler', { phase: n.expression.name.text, events, target: target ? target.replace('svcentity:', '') : null, targets: targets.map(t => t.replace('svcentity:', '')), drafts, service: own || null, ...(foreign ? { registeredFrom: svc || rel } : {}), crud: isCrud, file: rel, line: line(n), async: !!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword), fields: fields ? fields.split(',').map(x => x.trim().replace(/'/g, '')) : null }, meta(n))
        result.handlers++
        for (const t of targets) g.edge(id, 'handles', t, { phase: n.expression.name.text, events, drafts }, meta(n))
        if (!targets.length && own && isCrud && g.nodes.has(`service:${own}`)) g.edge(id, 'handles', `service:${own}`, { phase: n.expression.name.text, events }, meta(n))
        if (!isCrud) for (const e of events) {
          const owner = actionAliases[e]
          const cands = [owner && `action:${own}.${owner}.${e}`, `action:${own}.${e}`, `event:${own}.${e}`, ...g.byType('Action').filter(a => a.id.startsWith(`action:${own}.`) && a.id.endsWith(`.${e}`)).map(a => a.id)].filter(Boolean)
          let hit = cands.find(c => g.nodes.has(c))
          // an event of another service (or a messaging topic) this app listens to
          if (!hit && foreign && !/^\$|^\*$/.test(e)) { hit = `event:${own}.${e}`; g.node(hit, 'Event', { name: `${own}.${e}` }, meta(n)) }
          if (hit) g.edge(id, hit.startsWith('event:') && foreign ? 'subscribes' : 'handles', hit, { phase: n.expression.name.text }, meta(n))
          if (hit?.startsWith('event:') && foreign) result.subscriptions++
        }
        result.rules += analyse(fn, id, ctx).rules
        if (ctx.callsNext) g.nodes.get(id).props.delegates = true
        if (ctx.sql.length) g.nodes.get(id).props.nativeSql = ctx.sql
        return
      }
      n.forEachChild(visit)
    })

    // ---- the whole file, handlers or not (connectors, lib helpers): remote calls, native SQL, db-kind branches ----
    const sql = [], branches = []
    sf.forEachChild(function visit(n) {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const r = n.expression.expression, how = n.expression.name.text
        if (ts.isIdentifier(r) && svcVars[r.text] && svcVars[r.text] !== 'db' && REMOTE_CALLS.includes(how)) {
          const other = svcVars[r.text], to = g.nodes.has(`service:${other}`) && !g.nodes.get(`service:${other}`).props.remote ? `service:${other}` : `remote:${other}`
          if (!g.nodes.has(to)) g.node(to, 'ExternalService', { name: other })
          g.edge(`file:${rel}`, 'calls_service', to, { via: how }, meta(n))
        }
        const a0 = n.arguments[0]
        if (how === 'run' && a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0) || ts.isTemplateExpression(a0))) {
          const q = flat(src(a0)).replace(/^[`'"]|[`'"]$/g, '')
          if (SQL_START.test(q)) sql.push({ line: line(n), sql: q.slice(0, 160), hanaOnly: HANA_ONLY.test(q) })
        }
      }
      if (ts.isCallExpression(n) && src(n.expression) === 'cds.run' && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]) || ts.isTemplateExpression(n.arguments[0]))) {
        const q = flat(src(n.arguments[0])).replace(/^[`'"]|[`'"]$/g, '')
        if (SQL_START.test(q) && !sql.some(x => x.line === line(n))) sql.push({ line: line(n), sql: q.slice(0, 160), hanaOnly: HANA_ONLY.test(q) })
      }
      // code that branches on the database: switch (db.kind) { case 'hana': ... }, if (cds.db.kind === 'sqlite')
      if (ts.isSwitchStatement(n) && /kind/i.test(src(n.expression)) && n.caseBlock.clauses.some(c => ts.isCaseClause(c) && /^['"](hana|sqlite|postgres|h2)['"]$/.test(src(c.expression))))
        branches.push({ line: line(n), on: flat(src(n.expression)), cases: n.caseBlock.clauses.filter(ts.isCaseClause).map(c => src(c.expression).replace(/['"]/g, '')) })
      if (ts.isBinaryExpression(n) && /^={2,3}|!={1,2}$/.test(n.operatorToken.getText(sf)) && /kind/i.test(src(n.left)) && /^['"](hana|sqlite|postgres)['"]$/.test(src(n.right)))
        branches.push({ line: line(n), on: flat(src(n.left)), cases: [src(n.right).replace(/['"]/g, '')] })
      n.forEachChild(visit)
    })
    if (sql.length) { fileNode.props.nativeSql = sql; result.nativeSql += sql.length }
    if (branches.length) fileNode.props.dbBranches = branches
  }
  return result
}

module.exports = { extractHandlersAst }
