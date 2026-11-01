// Proves a corpus case is a valid app before it is scored: the CDS model compiles, the server boots
// under cds.test (SQLite in memory), the app's own tests pass (bases) or the seed's proof test passes
// (variants: the planted bug is real at runtime), TypeScript type-checks, and every UI5 project lints
// without a parse error and builds. Tools come from stress/node_modules (stress/package.json).
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { STRESS } = require('./case')

const BIN = path.join(STRESS, 'node_modules', '.bin')
const sh = (cmd, args, opts = {}) => new Promise(resolve => {
  const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, NODE_ENV: 'test', CDS_ENV: undefined, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
  const t = setTimeout(() => p.kill('SIGKILL'), opts.timeout || 180000)
  p.on('close', code => { clearTimeout(t); resolve({ code, out }) })
})
const tail = (s, n = 6) => String(s).trim().split('\n').filter(l => !/^\s*(at |#\s+at )/.test(l)).slice(-n).join('\n')

const isTs = root => fs.existsSync(path.join(root, 'tsconfig.json'))
const testFiles = (root, only) => {
  const d = path.join(root, 'test')
  if (!fs.existsSync(d)) return []
  return fs.readdirSync(d).filter(f => /\.test\.(c?js|ts)$/.test(f) && (only ? f === only : !f.startsWith('zz-proof'))).map(f => path.join('test', f))
}

async function nodeTest(root, files) {
  if (!files.length) return { ok: true, skipped: true }
  const ts = files.some(f => f.endsWith('.ts')) || isTs(root)
  const r = await sh(process.execPath, [...(ts ? ['--import', 'tsx'] : []), '--test', '--test-concurrency=1', ...files], { cwd: root, env: ts ? { CDS_TYPESCRIPT: 'true' } : {} })
  const pass = +(/# pass (\d+)/.exec(r.out) || [])[1] || 0, fail = +(/# fail (\d+)/.exec(r.out) || [])[1] || 0
  return { ok: r.code === 0 && fail === 0 && pass > 0, pass, fail, log: r.code === 0 ? undefined : tail(r.out.split('\n').filter(l => /not ok|expected|actual|Error|error:/.test(l)).join('\n'), 12) }
}

async function compile(root) {
  const r = await sh(path.join(BIN, 'cds'), ['compile', '*', '--to', 'csn'], { cwd: root, env: { CDS_TYPESCRIPT: isTs(root) ? 'true' : undefined } })
  return { ok: r.code === 0 && /"definitions"/.test(r.out), log: r.code === 0 ? undefined : tail(r.out) }
}

async function ui5(root, dirs) {
  const res = []
  for (const d of dirs) {
    const dir = path.join(root, d)
    if (!fs.existsSync(dir)) { res.push({ dir: d, ok: false, log: 'missing' }); continue }
    const lint = await sh(path.join(BIN, 'ui5lint'), ['--format', 'json'], { cwd: dir })
    let parsed = null; try { parsed = JSON.parse(lint.out.slice(lint.out.indexOf('['))) } catch {}
    const fatal = (parsed || []).flatMap(f => (f.messages || []).filter(m => m.fatal || /parse|syntax/i.test(m.message || '')).map(m => `${f.filePath}: ${m.message}`))
    const dest = path.join(path.dirname(root), 'ui5-dist', path.basename(d))
    const build = await sh(path.join(BIN, 'ui5'), ['build', '--dest', dest, '--clean-dest'], { cwd: dir, timeout: 240000 })
    res.push({ dir: d, ok: !!parsed && !fatal.length && build.code === 0, lint: parsed ? parsed.reduce((a, f) => a + (f.messages || []).length, 0) : null, fatal, log: build.code === 0 ? undefined : tail(build.out) })
  }
  return res
}

async function tsc(root) {
  if (!isTs(root)) return null
  const r = await sh(path.join(BIN, 'tsc'), ['--noEmit', '-p', '.'], { cwd: root })
  return { ok: r.code === 0, log: r.code === 0 ? undefined : tail(r.out, 10) }
}

// conf: stress.json of the base; proof: test file name (variants) or null (bases: the app's own tests)
async function validate(root, conf, { proof } = {}) {
  const v = { compile: await compile(root) }
  v.tests = await nodeTest(root, proof ? testFiles(root, proof) : testFiles(root))
  v.ts = await tsc(root)
  v.ui5 = conf.ui5?.length ? await ui5(root, conf.ui5) : []
  v.ok = v.compile.ok && v.tests.ok && (!v.ts || v.ts.ok) && v.ui5.every(u => u.ok)
  return v
}

module.exports = { validate, nodeTest, compile, sh, tail }
