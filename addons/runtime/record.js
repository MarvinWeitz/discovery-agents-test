// Records what CAP really registers while the app starts: every srv.before/on/after call with its event,
// entity and the line of code that made it, plus each served service's path and protocols. Loaded by the
// workflow's startup test before cds.test(...) starts the app; dump() writes run/runtime.json.
// Hooks the app's own @sap/cds: EventHandlers.prototype.register in lib/srv/srv-handlers.js
// (Sources: docs/walkthrough/references.md, Runtime).
const fs = require('fs')
const path = require('path')

// event or entity as text: a string, a definition ({name}), or a list of either; '*' when left out
const names = x => x == null ? '*' : Array.isArray(x) ? x.map(names).join(',') : typeof x === 'string' ? x : typeof x?.name === 'string' ? x.name : String(Object.prototype.toString.call(x))

function start(appRoot) {
  const calls = []
  const EventHandlers = require(require.resolve('@sap/cds/lib/srv/srv-handlers', { paths: [appRoot] }))
  const register = EventHandlers.prototype.register
  let depth = 0
  EventHandlers.prototype.register = function (srv, phase, event, p, handler) {
    if (depth === 0) {
      // the caller of srv.before/on/after (frames inside the registration API itself skipped): the app's own
      // code, a plugin package, or @sap/cds itself (CAP's generic handlers, not recorded)
      const frames = String(new Error().stack).split('\n').slice(2).map(l => l.match(/\(?([^()\s]+):(\d+):\d+\)?$/)).filter(Boolean)
      const caller = frames.find(m => !/[\\/]lib[\\/]srv[\\/](srv-handlers|cds\.Service)\.js$/.test(m[1]) && !m[1].includes(__filename) && !m[1].startsWith('node:'))
      const site = caller && !/node_modules[\\/]@sap[\\/]cds[\\/]/.test(caller[1]) ? caller : null
      const file = site?.[1].replace(/^file:\/\//, '')
      const plugin = file?.match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/)?.[1] || null
      const target = handler ? p : undefined // register(srv, phase, event, handler) leaves out the path
      if (site) try {
        calls.push({ service: srv.name, phase, event: names(event), path: names(target),
          file: plugin ? null : path.relative(appRoot, file), line: plugin ? null : Number(site[2]), plugin })
      } catch { /* recording must never stop the app */ }
    }
    depth++
    try { return register.apply(this, arguments) } finally { depth-- }
  }
  return {
    dump(out, cds) {
      const services = Object.values(cds.services).filter(s => s.definition || s.options?.kind).map(s => ({
        name: s.name, kind: s instanceof cds.ApplicationService ? 'application' : s.options?.kind || s.constructor.name,
        path: s.path || null, endpoints: (s.endpoints || []).map(e => ({ kind: e.kind, path: e.path })),
        impl: s.options?.impl?._source ? path.relative(appRoot, s.options.impl._source) : null,
      }))
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, JSON.stringify({ cds: cds.version, profiles: cds.env.profiles, services, registrations: calls }, null, 1))
    },
  }
}

module.exports = { start }
