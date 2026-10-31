// Readers for what CI measured (run/measured/): the request log of recorder.js and Jest's coverage JSON
// (istanbul format, from --coverageProvider=v8 --coverageReporters=json).
const fs = require('fs')
const path = require('path')

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }

// a request CAP rejected before any handler ran has no target: name its entity set and verb from the URL
const VERB = { GET: 'READ', POST: 'CREATE', PATCH: 'UPDATE', PUT: 'UPDATE', DELETE: 'DELETE' }
function fromUrl(e) {
  if (e.entity || !e.url) return e
  const segs = e.url.split('?')[0].split('/').filter(Boolean).map(s => s.replace(/\(.*$/, ''))
  const i = segs.findIndex(s => /^[A-Z]/.test(s)); if (i < 0) return e
  const action = segs[i + 1] && segs[i + 1].split('.').pop()
  return { ...e, entity: segs[i], event: e.event || action || VERB[e.method] || null }
}

// every recorded request: { test, file, service, event, entity, url, user, outcome, status, queries, inner }
function readRequests(dir) {
  const d = path.join(dir, 'requests')
  let files = []; try { files = fs.readdirSync(d).filter(f => f.endsWith('.jsonl')).sort() } catch { return [] }
  return files.flatMap(f => fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)).map(fromUrl)
}

// Map(file relative to the app root -> Set of executed lines), union of every coverage-final.json under dir
function readCoverage(dir, appRoot) {
  const out = new Map()
  let dirs = []; try { dirs = fs.readdirSync(dir).filter(x => x.startsWith('coverage')) } catch { return out }
  const root = appRoot || readJson(path.join(dir, '..', 'metrics.json'))?.root || ''
  for (const x of dirs) {
    const cov = readJson(path.join(dir, x, 'coverage-final.json')); if (!cov) continue
    for (const [abs, f] of Object.entries(cov)) {
      const rel = path.relative(root, f.path || abs).split(path.sep).join('/')
      const lines = out.get(rel) || new Set()
      for (const [id, n] of Object.entries(f.s || {})) if (n > 0) { const m = f.statementMap[id]; for (let l = m.start.line; l <= Math.min(m.end.line, m.start.line + 3); l++) lines.add(l) }
      out.set(rel, lines)
    }
  }
  return out
}

module.exports = { readRequests, readCoverage }
