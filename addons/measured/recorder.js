// Records, while tests run, what reaches the app: every request a service handles (user, entity, event,
// outcome, the test that sent it) and the queries it sends to the database. Uses only CAP's public event
// API: srv.before/after('*'), srv.on('error'), cds.db.before('*'), cds.on('served'); no patching.
// Loaded as a Jest setup file (--setupFilesAfterEnv) or required by a test. One JSONL file per test file
// in $DISCOVERY_MEASURE_OUT/requests/. Never fails a test: every hook swallows its own errors.
// Walkthrough: docs/walkthrough/11-atlas-and-addons.md (addon measured) · Sources: references.md (Runtime)
const fs = require('fs')
const path = require('path')

function install() {
  if (globalThis.__discoveryRecorder) return globalThis.__discoveryRecorder
  const out = process.env.DISCOVERY_MEASURE_OUT
  let cds
  try { cds = require(require.resolve('@sap/cds', { paths: [process.cwd()] })) } catch { return null }
  const entries = [], byCtx = new Map()
  const where = () => { try { const s = globalThis.expect?.getState?.(); return s ? { test: s.currentTestName || null, file: s.testPath ? path.relative(process.cwd(), s.testPath) : null } : {} } catch { return {} } }
  const safe = fn => function (...a) { try { return fn.apply(this, a) } catch { /* recording must never break the app */ } }
  // entity name without service and without the draft suffix: TravelService.Travel.drafts -> Travel
  const short = n => n ? String(n).replace(/\.drafts$/, '').split('.').pop() : null
  const entryOf = (srv, req) => {
    const id = req.context?.id || cds.context?.id
    const top = id && byCtx.get(id)
    const e = { ...where(), service: srv.name, event: req.event == null ? null : String(req.event), entity: short(req.target?.name || req.entity), url: req.http?.req?.originalUrl || null, method: req.http?.req?.method || null, user: req.user?.id || null, anonymous: req.user?.id === 'anonymous', outcome: null, status: null, queries: [] }
    // a request a handler sends while serving another one (same context): listed under the outer request
    if (top) { (top.inner ||= []).push({ service: e.service, event: e.event, entity: e.entity }); return { e: top, top: false } }
    if (id) byCtx.set(id, e)
    entries.push(e)
    return { e, top: true }
  }
  const seen = new WeakSet()
  const attach = () => {
    for (const srv of Object.values(cds.services)) {
      if (!(srv instanceof cds.ApplicationService) || seen.has(srv)) continue
      seen.add(srv)
      srv.before('*', safe(function (req) { if (!req._discovery) req._discovery = entryOf(srv, req) }))
      srv.after('*', safe(function (_, req) { const d = req._discovery; if (d?.top && !d.e.outcome) { d.e.outcome = 'ok'; d.e.status = 200 } }))
      // errors, including rejections by CAP's own auth handlers that run before ours
      // the error handler may get another request object than before('*'): find the top request by context id
      srv.on('error', safe(function (err, req) {
        const id = req?.context?.id || cds.context?.id
        const e = req?._discovery?.e || (id && byCtx.get(id)) || entryOf(srv, req || {}).e
        if (!e.outcome || e.outcome === 'ok') { e.outcome = 'error'; e.status = Number(err.status || err.statusCode) || Number(err.code) || 500 }
      }))
    }
    if (cds.db && !seen.has(cds.db)) {
      seen.add(cds.db)
      cds.db.before('*', safe(function (req) {
        const id = req.context?.id || cds.context?.id, e = id && byCtx.get(id)
        if (e && e.queries.length < 50) e.queries.push({ kind: req.event, entity: short(req.target?.name) || null })
      }))
    }
  }
  cds.on('served', safe(attach))
  const dump = () => {
    if (!out || !entries.length) return
    try {
      const dir = path.join(out, 'requests'); fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`), entries.map(e => JSON.stringify(e)).join('\n') + '\n')
      entries.length = 0
    } catch {}
  }
  if (typeof globalThis.afterAll === 'function') globalThis.afterAll(dump)
  process.once('exit', dump)
  return (globalThis.__discoveryRecorder = { entries, dump, attach })
}

module.exports = install()
