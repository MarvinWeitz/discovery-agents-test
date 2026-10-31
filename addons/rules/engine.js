// Runs the rules library: deterministic detectors that started life as agent findings.
// A rule module exports { key, title, status: 'draft' | 'accepted', from, i, l, lay, test, detect(ctx) }
// where detect returns [{ ev: 'file:line', t, d }]. ctx = { root, files: [{ path, text }], g, csn }.
// Only accepted rules feed the atlas risks; drafts are reported next to them until a reviewer accepts.
// Code-pattern rules also live in opengrep/js.yml and cds.yml (Opengrep / Semgrep rule format, same id as the
// module). When an Opengrep CLI is installed ($DISCOVERY_OPENGREP, `opengrep`, or Semgrep CE's `semgrep`),
// it runs those rules once over the same files and its hits replace the module's own detect();
// rules no such tool can express (writable-owner-field reads the compiled model) keep detect().
// Step 9c · Walkthrough: docs/walkthrough/09-patterns-risks-rules.md
const fs = require('fs')
const path = require('path')

const { spawnSync } = require('child_process')
const { layout } = require('../../lib/project/layout')

const LIB = path.join(__dirname, 'library')

function sources(root) {
  const out = []
  const walk = (d, rel) => {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      if (['node_modules', '.git', 'gen', '@cds-models', 'webapp', 'dist', 'test', 'src'].includes(e.name)) continue
      const p = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(p, r)
      else if (/\.(cds|js|ts)$/.test(e.name) && !/\.d\.ts$|\.test\./.test(e.name)) out.push({ path: r, text: fs.readFileSync(p, 'utf8') })
    }
  }
  const L = layout(root)
  for (const d of [L.srv, L.db, L.app]) walk(path.join(root, d), d)
  return out
}

function library() {
  return fs.readdirSync(LIB).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).sort().map(f => require(path.join(LIB, f)))
}

const OG = path.join(__dirname, 'opengrep')
const CONFIGS = fs.readdirSync(OG).filter(f => f.endsWith('.yml')).sort().map(f => path.join(OG, f))
// no network: Semgrep CE checks for updates and sends metrics unless told not to
const ENV = { ...process.env, SEMGREP_ENABLE_VERSION_CHECK: '0', SEMGREP_SEND_METRICS: 'off' }

// the first Opengrep-compatible CLI that answers --version: { bin, version } or null
function cli() {
  if (process.env.DISCOVERY_OPENGREP === 'off') return null
  for (const bin of [process.env.DISCOVERY_OPENGREP, 'opengrep', 'semgrep'].filter(Boolean)) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 60000, env: ENV })
    if (r.status === 0) return { bin, version: `${path.basename(bin)} ${r.stdout.trim().split('\n').pop()}` }
  }
  return null
}

// runs the rule files over the given files; Map(rule id -> [{ ev, t, d }]) or { error }
function opengrep(tool, root, files) {
  const r = spawnSync(tool.bin, ['scan', '--metrics=off', '--quiet', '--json', ...CONFIGS.flatMap(c => ['--config', c]), ...files.map(f => path.join(root, f.path))],
    { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 28, cwd: root, env: ENV })
  let j; try { j = JSON.parse(r.stdout) } catch { return { error: (r.stderr || r.error?.message || 'no output').split('\n')[0] } }
  const hits = new Map()
  for (const x of j.results || []) {
    const id = x.check_id.split('.').pop().replace(/--.*$/, '')
    const [t, d] = String(x.extra.message).split(' || ')
    const ev = `${path.relative(root, path.resolve(root, x.path)).split(path.sep).join('/')}:${x.start.line}`
    const list = hits.get(id) || []
    if (!list.some(h => h.ev === ev)) list.push({ ev, t: t.trim(), d: `${ev}: ${(d || t).trim()}` })
    hits.set(id, list)
  }
  return { hits, errors: (j.errors || []).map(e => String(e.message).split('\n')[0]) }
}

function ruleIds() {
  try { return new Set(CONFIGS.flatMap(c => [...fs.readFileSync(c, 'utf8').matchAll(/^\s*- id:\s*([\w-]+)/gm)].map(m => m[1].replace(/--.*$/, '')))) } catch { return new Set() }
}

function run(ctx) {
  const ids = ruleIds(), tool = ids.size ? cli() : null
  const og = tool ? opengrep(tool, ctx.root, ctx.files) : null
  return library().map(r => {
    let hits = [], error = null, via = 'own detect()'
    if (og?.hits && ids.has(r.key)) { hits = og.hits.get(r.key) || []; via = tool.version }
    else try { hits = r.detect(ctx) || [] } catch (e) { error = e.message }
    return { key: r.key, title: r.title, status: r.status, from: r.from, i: r.i, l: r.l, lay: r.lay, test: r.test, hits, error, via }
  })
}

module.exports = { sources, library, run, cli, opengrep, CONFIGS }
