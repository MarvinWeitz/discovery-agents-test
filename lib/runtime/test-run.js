// The runtime half of a discovery run, inside the project itself: start the app under cds.test, run the
// generated tests, measure (addon measured), then the after-tests stage. Same steps, same order and same
// fallbacks as the "Run discovery" workflow used to do in shell (PILOTS.md says why each one exists):
//   install      only when node_modules is missing (or install: 'always'); never when 'never'
//   typer        cds-typer models for apps that use @cap-js/cds-typer
//   runtime      Jest, @cap-js/cds-test, SQLite, missing deps: added to a folder ABOVE the project so the
//                app's package.json stays untouched. In CI that is the parent folder; on a laptop only when
//                runtimeDir is given (nothing is written outside the project unasked)
//   clients      the app's own openapi-generator commands (gitignored SAP Cloud SDK clients)
//   startup      does the app start in-process with an in-memory database? Jest, else Node's test runner
//   generated    run/tests/generated/*.test.js copied to <app>/test/generated and run
//   measured     authorization probe, request log, V8 coverage (addon measured)
//   after-tests  addons that use the results, findings again, validate (bin/after-tests.js)
// The test folders written into the app (test/generated, test/discovery-*) are removed afterwards unless
// keepTests.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const TOOLKIT = path.join(__dirname, '..', '..')
const CI = !!process.env.CI

// nearest <dir>/node_modules/<pkg> at or above `from`
function findPkg(from, pkg) {
  for (let d = path.resolve(from); ; d = path.dirname(d)) {
    const p = path.join(d, 'node_modules', pkg)
    if (fs.existsSync(path.join(p, 'package.json'))) return fs.realpathSync(p)
    if (path.dirname(d) === d) return null
  }
}
const version = dir => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version

function sh(cmd, { cwd, env, log }) {
  log(`$ ${cmd}`)
  return spawnSync(cmd, { cwd, env: { ...process.env, ...env }, shell: '/bin/bash', stdio: 'inherit' }).status === 0
}
function node(args, { cwd, env, log, timeout = 1800000 }) {
  log(`$ node ${args.map(a => /\s/.test(a) ? JSON.stringify(a) : a).join(' ')}`)
  return spawnSync(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit', timeout }).status === 0
}

function installApp(installDir, pm, log) {
  const cmds = {
    pnpm: 'corepack enable && (pnpm install --frozen-lockfile || pnpm install)',
    yarn: 'corepack enable && (yarn install --frozen-lockfile || yarn install)',
    npm: fs.existsSync(path.join(installDir, 'package-lock.json')) || fs.existsSync(path.join(installDir, 'npm-shrinkwrap.json'))
      ? 'npm ci --no-audit --no-fund || npm install --no-audit --no-fund' : 'npm install --no-audit --no-fund',
  }
  const ok = sh(cmds[pm] || cmds.npm, { cwd: installDir, log })
  // repos that set ignore-scripts (e.g. in .npmrc) skip SQLite's native build; run just that one
  if (fs.existsSync(path.join(installDir, 'node_modules', 'better-sqlite3')) &&
      spawnSync(process.execPath, ['-e', "new (require('better-sqlite3'))(':memory:')"], { cwd: installDir }).status !== 0)
    sh('npm rebuild better-sqlite3 --ignore-scripts=false', { cwd: installDir, log })
  return ok
}

// Jest, cds.test, SQLite and missing deps: what the app lacks goes into <runtimeDir>/node_modules
function testRuntime(appDir, installDir, runtimeDir, log) {
  const has = p => !!findPkg(appDir, p)
  const pkgs = []
  const cdsDir = findPkg(appDir, '@sap/cds')
  const major = cdsDir ? +version(cdsDir).split('.')[0] : 9
  if (!cdsDir) pkgs.push('@sap/cds@9')
  if (!has('@cap-js/sqlite')) pkgs.push(`@cap-js/sqlite@${major >= 9 ? 2 : 1}`)
  if (major >= 9 && !has('@cap-js/cds-test')) pkgs.push('@cap-js/cds-test') // since cds 9, cds.test lives there
  if (!has('jest')) pkgs.push('jest@29')
  // one @sap/cds instance, and dependencies a broken lockfile left out
  const r = spawnSync(process.execPath, [path.join(__dirname, 'repair-install.js'), appDir, installDir],
    { encoding: 'utf8', env: { ...process.env, DISCOVERY_REPAIR_LINKS: CI || runtimeDir ? '1' : '0' }, stdio: ['ignore', 'pipe', 'inherit'] })
  pkgs.push(...String(r.stdout || '').split('\n').map(s => s.trim()).filter(Boolean))
  log(`cds ${cdsDir ? version(cdsDir) : 'missing'}; test runtime needs: ${pkgs.join(' ') || 'nothing'}`)

  if (pkgs.length && !runtimeDir) return { ok: false, why: `the app lacks ${pkgs.join(', ')}; add them as devDependencies, or pass --runtime-dir <a folder above the project>` }
  if (pkgs.length) {
    const root = path.resolve(runtimeDir)
    if (!(appDir + path.sep).startsWith(root + path.sep)) return { ok: false, why: `--runtime-dir ${root} must be a folder above ${appDir}, or Node will not find it` }
    if (!sh(`npm i --prefix ${JSON.stringify(root)} --no-audit --no-fund --legacy-peer-deps ${pkgs.map(p => JSON.stringify(p)).join(' ')}`, { cwd: appDir, log }))
      return { ok: false, why: 'npm could not install the test runtime' }
    // packages added here peer-depend on @sap/cds: let them find the app's own copy (one cds instance)
    if (cdsDir && !pkgs.some(p => p.startsWith('@sap/cds@'))) {
      fs.mkdirSync(path.join(root, 'node_modules', '@sap'), { recursive: true })
      const link = path.join(root, 'node_modules', '@sap', 'cds')
      fs.rmSync(link, { recursive: true, force: true })
      fs.symlinkSync(cdsDir, link, 'dir')
    }
  }
  // the app's own Jest (declared or hoisted) keeps its config; otherwise the one added above
  const ownJest = findPkg(appDir, 'jest')
  const jestBin = d => ['bin/jest.js', 'bin/jest'].map(b => path.join(d, b)).find(f => fs.existsSync(f))
  const jest = ownJest && !pkgs.some(p => p.startsWith('jest@'))
    ? [jestBin(ownJest)]
    : [jestBin(path.join(path.resolve(runtimeDir), 'node_modules', 'jest')), '--config', '{"testEnvironment":"node"}', '--rootDir', '.']
  return { ok: true, jest, added: pkgs }
}

const STARTUP_TEST = `// Written by cap-discovery: does the app start in-process with an in-memory database?
const fs = require('fs'), path = require('path')
const cds = require('@sap/cds')
const rec = fs.existsSync(process.env.DISCOVERY_RECORDER || '') ? require(process.env.DISCOVERY_RECORDER).start(path.resolve(__dirname, '../..')) : null
cds.test(__dirname + '/../..', '--with-mocks') // required services without credentials as local mocks
it('app starts and serves its services', () => {
  rec?.dump(process.env.DISCOVERY_RUNTIME_OUT, cds)
  if (!Object.values(cds.services).some(s => s instanceof cds.ApplicationService)) throw new Error('no application service served')
})
`

// det: lib/project/detect.js output; out: the pipeline's out dir; reports: where the Jest reports go
async function runTests({ appDir, installDir, det, out, reports, install = 'auto', runtimeDir, keepTests = false, log = console.log }) {
  const R = { install: 'skipped', startup: 'skipped', generated: 'skipped', measured: 'skipped', aftertests: 'skipped', runner: 'jest', why: '' }
  fs.mkdirSync(reports, { recursive: true })
  const written = []
  const authEnv = det.mockauth === 'true' || det.mockauth === true ? { CDS_REQUIRES_AUTH_KIND: 'mocked' } : {} // token-only auth: CAP's mocked users

  try {
    if (install === 'always' || (install === 'auto' && !fs.existsSync(path.join(installDir, 'node_modules'))))
      R.install = installApp(installDir, det.pm, log) ? 'success' : 'failure'

    if (det.typer === 'true' || det.typer === true) sh('npx --no-install cds-typer "*"', { cwd: appDir, log }) || log('cds-typer failed; continuing')

    const rt = testRuntime(appDir, installDir, runtimeDir ?? (CI ? path.dirname(installDir) : null), log)
    if (!rt.ok) { R.why = rt.why; log(`runtime tests skipped: ${rt.why}`); return R }

    // SAP Cloud SDK clients generated from OpenAPI specs before the app's own build (gitignored)
    if (R.install !== 'skipped' || CI) {
      const scripts = (() => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).scripts || {}) } catch { return [] } })()
      for (const c of new Set(scripts.flatMap(s => s.split(/&&|;/)).map(c => c.trim()).filter(c => /\bopenapi-generator\b/.test(c)))) sh(c, { cwd: appDir, log }) || log(`client generation failed: ${c}`)
    }

    const jest = (args, env) => node([...rt.jest, ...args], { cwd: appDir, env: { ...authEnv, ...env }, log })
    const nodeTest = (dir, report, env) => node([path.join(__dirname, 'node-test.js'), dir, '--outputFile', report], { cwd: appDir, env: { ...authEnv, ...env }, log })

    // startup
    const startupDir = path.join(appDir, 'test', 'discovery-startup')
    fs.mkdirSync(startupDir, { recursive: true }); written.push(startupDir)
    fs.writeFileSync(path.join(startupDir, 'startup.test.js'), STARTUP_TEST)
    const recEnv = { DISCOVERY_RECORDER: path.join(TOOLKIT, 'addons', 'runtime', 'record.js'), DISCOVERY_RUNTIME_OUT: path.join(out, 'run', 'runtime.json') }
    const startupReport = path.join(reports, 'jest-startup.json')
    if (jest(['test/discovery-startup', '--ci', '--forceExit', '--testTimeout', '120000', '--json', `--outputFile=${startupReport}`], recEnv)) R.startup = 'success'
    else {
      log("The app does not start under Jest; retrying with Node's test runner.")
      R.runner = 'node'
      R.startup = nodeTest('test/discovery-startup', startupReport, recEnv) ? 'success' : 'failure'
    }
    if (R.startup !== 'success') { R.why = 'the app did not start under cds.test'; return R }

    // generated tests
    const genDir = path.join(appDir, 'test', 'generated')
    if (!fs.existsSync(genDir)) written.push(genDir)
    fs.mkdirSync(genDir, { recursive: true })
    const src = path.join(out, 'run', 'tests', 'generated')
    for (const f of fs.readdirSync(src).filter(f => f.endsWith('.test.js'))) fs.copyFileSync(path.join(src, f), path.join(genDir, f))
    const genReport = path.join(reports, 'jest-generated.json')
    R.generated = (R.runner === 'node' ? nodeTest('test/generated', genReport) : jest(['test/generated', '--ci', '--forceExit', '--testTimeout', '60000', '--json', `--outputFile=${genReport}`])) ? 'success' : 'failure'

    // addon measured: ask the running app instead of guessing
    const addons = require('../addons')
    if (addons.enabled('measured')) {
      const mOut = path.join(out, 'run', 'measured'), mDir = path.join(appDir, 'test', 'discovery-measure')
      fs.mkdirSync(mOut, { recursive: true }); fs.mkdirSync(mDir, { recursive: true }); written.push(mDir)
      for (const f of ['authz-probe.test.js', 'recorder.js']) fs.copyFileSync(path.join(TOOLKIT, 'addons', 'measured', f), path.join(mDir, f))
      const env = { DISCOVERY_MEASURE_OUT: mOut }, rec = path.join(mDir, 'recorder.js')
      const cov = ['--coverage', '--coverageProvider=v8', '--coverageReporters=json']
      if (R.runner === 'node') nodeTest('test/discovery-measure', path.join(reports, 'jest-measure.json'), env)
      else {
        jest(['test/discovery-measure', 'test/generated', '--ci', '--forceExit', '--testTimeout', '600000', '--setupFilesAfterEnv', rec, ...cov, '--coverageDirectory', path.join(mOut, 'coverage-generated')], env)
        // the app's own tests, when it has any outside the folders written here
        const own = (function find(d, depth = 0) {
          if (depth > 6) return false
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name)
            if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.') || p === genDir || /^discovery-/.test(e.name)) continue; if (find(p, depth + 1)) return true }
            else if (/\.(test|spec)\.[jt]s$/.test(e.name)) return true
          }
          return false
        })(appDir)
        if (own) {
          const cfg = spawnSync(process.execPath, [...rt.jest, '--showConfig'], { cwd: appDir, encoding: 'utf8' })
          let setup = 0; try { setup = JSON.parse(cfg.stdout).configs[0].setupFilesAfterEnv.length } catch {}
          if (setup) log('own Jest setup files kept: own tests run without the request log')
          jest(['--ci', '--forceExit', '--testTimeout', '120000', ...(setup ? [] : ['--setupFilesAfterEnv', rec]), ...cov, '--coverageDirectory', path.join(mOut, 'coverage-own'),
            '--testPathIgnorePatterns', '/node_modules/', '/test/generated/', '/test/discovery-', '/app/'], env)
        }
      }
      R.measured = 'ran' // a measurement, never a check
    }
    return R
  } finally {
    // after-tests runs whatever happened above: measured findings, rebuilt atlas, findings again, validate
    const st = R.startup !== 'success' ? 'skipped' : R.generated === 'success' ? 'ran' : 'failed'
    node([path.join(TOOLKIT, 'bin', 'stages.js'), 'record', out, 'run-tests', st, `startup ${R.startup}, generated tests ${R.generated}`], { log })
    R.aftertests = node([path.join(TOOLKIT, 'bin', 'after-tests.js'), out, '--generated', path.join(reports, 'jest-generated.json')], { log }) ? 'success' : 'failure'
    if (!keepTests) for (const d of written) fs.rmSync(d, { recursive: true, force: true })
    fs.writeFileSync(path.join(reports, 'tests.json'), JSON.stringify(R, null, 1))
  }
}

module.exports = { runTests, installApp, findPkg }
