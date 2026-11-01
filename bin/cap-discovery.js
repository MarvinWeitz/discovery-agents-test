#!/usr/bin/env node
// cap-discovery: the whole toolkit as one command that runs INSIDE a CAP project (portable mode).
// Nothing has to be added to the project: install it from the toolkit's (private) repo, from the GitHub
// Action, or from the Claude Code plugin's copy (node ${CLAUDE_PLUGIN_ROOT}/bin/cap-discovery.js).
//
//   npm install -g --legacy-peer-deps git+https://<host>/<owner>/<toolkit-repo>.git#<ref>   (once)
//   cap-discovery <command> [options]
//
//   init     write discovery.config.json, a GitHub workflow, Claude Code settings for the AI pass, .gitignore line
//   run      static pipeline: discover, facts, findings, tests, atlas, validate (no app start, no AI)
//   test     start the app under cds.test, run the generated tests, measure, after-tests (needs the app installed)
//   all      run + test
//   docs     copy the Markdown output (atlas, findings, report) to a folder you commit, e.g. docs/discovery
//   summary  Markdown summary of the last run on stdout (job summary, PR comment)
//   ai       the optional AI pass on the open gaps (bin/ai-pass.js; in Claude Code: /cap-discovery:fill-gaps)
//              ai requests          one request file per open gap an AI can work on
//              ai plan [--limit N]  the requests still to answer, with the exact agent prompt (JSON)
//              ai check <gap>       gate one answer now: schema, gap, every quote on its line
//              ai merge             gate all answers and fold them into the findings (mode static+ai)
//              ai status            every request: pending, unmerged, accepted, rejected, unknown
//   where    what it would analyse: project, app folder, UI5 folders, config files, output folder
//
// Options (all optional; the project is the current folder):
//   --project <dir>      the repo or project root                       (default: current folder)
//   --app <path>         CAP project folder, relative to --project      (default: detected)
//   --ui <a,b|->         UI5 project folders, relative to --project     (default: detected, "-" none)
//   --out <dir>          output folder                                  (default: <project>/.discovery)
//   --reports <dir>      Jest reports and tests.json                    (default: <out>/reports)
//   --mode <m>           static | static+ai                             (default: config, then static)
//   --base <file>        curated agent findings to merge
//   --docs <dir>         also copy the Markdown output there            (default: config "docs", else none)
//   --install <when>     auto | always | never: install the app first   (all/test: auto = when node_modules is missing; run: never)
//   --runtime-dir <dir>  folder above the project for Jest/cds-test/SQLite the app lacks (default: parent folder in CI, else none)
//   --slug <owner/repo>  name used for curated findings and titles      (default: $GITHUB_REPOSITORY, else package name)
//   --keep-tests         leave test/generated and test/discovery-* in the app (default: removed after the run)
//   --force              init: overwrite existing files
//   --toolkit <loc>      init: where the toolkit lives, https://<host>/<owner>/<repo> or owner/repo
//                        (default: $CAP_DISCOVERY_TOOLKIT, else "repository" in the toolkit's package.json)
//   --ref <ref>          init: branch, tag or commit of the toolkit the workflow uses (default main)
// Config: the project's discovery.config.json is merged over the toolkit's defaults (lib/config.js).
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const TOOLKIT = path.join(__dirname, '..')
const argv = process.argv.slice(2)
const FLAGS = new Set(['--keep-tests', '--force', '--help', '-h', '--redo', '--json'])
const opts = {}, pos = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (FLAGS.has(a)) opts[a.replace(/^-+/, '')] = true
  else if (a.startsWith('--')) { const [k, v] = a.includes('=') ? a.slice(2).split(/=(.*)/s) : [a.slice(2), argv[++i]]; opts[k] = v }
  else pos.push(a)
}
const cmd = pos[0]
const log = m => console.error(`[cap-discovery] ${m}`)
const usage = () => { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('\n').slice(1).filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n') + '\n') }
if (!cmd || opts.help || opts.h) { usage(); process.exit(cmd ? 0 : 2) }

const project = path.resolve(opts.project || process.cwd())
const projectConfig = path.join(project, 'discovery.config.json')
// lib/config.js merges this over the toolkit defaults, here and in every stage the pipeline starts
if (fs.existsSync(projectConfig) && !process.env.DISCOVERY_CONFIG) process.env.DISCOVERY_CONFIG = projectConfig
const { config } = require('../lib/config')
const cfg = config()
const out = path.resolve(project, opts.out || cfg.out || '.discovery')
const reports = path.resolve(opts.reports || path.join(out, 'reports'))
const slug = opts.slug || process.env.GITHUB_REPOSITORY || (() => { try { return JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8')).name } catch { return path.basename(project) } })()

async function where() {
  const { detect } = require('../lib/project/detect')
  const det = await detect(project, { appArg: opts.app || cfg.app || '', uiArg: opts.ui || cfg.ui || '', slug, curatedDir: path.join(TOOLKIT, 'curated') })
  const appDir = path.resolve(project, det.app)
  return { det, appDir, installDir: path.resolve(project, det.install) }
}

function node(file, args, { optional = false } = {}) {
  const r = spawnSync(process.execPath, [path.join(TOOLKIT, 'bin', file), ...args], { stdio: 'inherit', env: process.env })
  if (r.status !== 0 && !optional) { log(`${file} failed (exit ${r.status})`); process.exit(r.status || 1) }
  return r.status === 0
}

// install first when asked: the pipeline reads more from an installed app (plugins, the app's own CAP)
async function install(when) {
  const { det, installDir } = await where()
  if (when === 'always' || (when === 'auto' && !fs.existsSync(path.join(installDir, 'node_modules')))) {
    const ok = require('../lib/runtime/test-run').installApp(installDir, det.pm, log)
    log(`install ${ok ? 'done' : 'failed; the pipeline reads the sources with the toolkit\'s own @sap/cds'}`)
  }
}

async function run() {
  const { det, appDir } = await where()
  log(`project ${project}; app ${det.app}${det.ui ? `; UI5 ${det.ui}` : ''}; out ${path.relative(project, out) || '.'}`)
  const base = opts.base || (det.curated ? path.join(TOOLKIT, det.curated) : '')
  const args = [appDir, out, ...(det.ui ? ['--ui', det.ui] : []), ...(base ? ['--base', path.resolve(project, base)] : []), ...(opts.mode ? ['--mode', opts.mode] : [])]
  node('pipeline.js', args)
  ignoreOut()
}

async function test() {
  if (!fs.existsSync(path.join(out, 'atlas-data.json'))) { log(`no run in ${out}; run "cap-discovery run" first`); process.exit(2) }
  const { det, appDir, installDir } = await where()
  const { runTests } = require('../lib/runtime/test-run')
  const R = await runTests({ appDir, installDir, det, out, reports, install: opts.install || 'auto', runtimeDir: opts['runtime-dir'], keepTests: !!opts['keep-tests'], log })
  log(`startup ${R.startup}, generated tests ${R.generated}, measured ${R.measured}, after tests ${R.aftertests}${R.why ? ` (${R.why})` : ''}`)
  return R
}

// The Markdown-first subset, for a folder that is committed: atlas (README, topics, images, index.html),
// the findings overview, the discovery report, the generated tests and what ran
function docs(dir) {
  const target = path.resolve(project, dir)
  if (!fs.existsSync(path.join(out, 'atlas', 'README.md'))) { log(`no atlas in ${out}`); return }
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  fs.cpSync(path.join(out, 'atlas'), target, { recursive: true })
  const copy = (from, to) => { const f = path.join(out, from); if (fs.existsSync(f)) fs.cpSync(f, path.join(target, to), { recursive: true }) }
  copy('run/findings/README.md', 'findings.md')
  copy('run/discovery-report.md', 'discovery-report.md')
  copy('run/tests/generated', 'tests')
  copy('docs', 'test-backed')
  if (fs.existsSync(path.join(out, 'manifest.json'))) {
    const r = spawnSync(process.execPath, [path.join(TOOLKIT, 'bin', 'stages.js'), 'show', out], { encoding: 'utf8' })
    if (r.status === 0) fs.writeFileSync(path.join(target, 'stages.md'), r.stdout)
  }
  log(`Markdown output copied to ${path.relative(project, target)}`)
}

function summary() {
  const r = spawnSync(process.execPath, [path.join(TOOLKIT, 'lib', 'runtime', 'summary.js'), reports, path.relative(reports, out) || '.', opts.title || `Discovery: ${slug}`], { encoding: 'utf8' })
  process.stdout.write(r.stdout || '')
  for (const f of fs.existsSync(path.join(out, 'pr')) ? fs.readdirSync(path.join(out, 'pr')).filter(f => f.endsWith('.md')) : []) process.stdout.write('\n' + fs.readFileSync(path.join(out, 'pr', f), 'utf8'))
}

// .discovery/ is a build output; keep it out of git unless the project says otherwise
function ignoreOut() {
  const rel = path.relative(project, out)
  if (!rel || rel.startsWith('..') || !fs.existsSync(path.join(project, '.git'))) return
  const gi = path.join(project, '.gitignore')
  const lines = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8').split('\n') : []
  if (!lines.some(l => l.trim().replace(/\/$/, '') === rel || l.trim().replace(/^\//, '').replace(/\/$/, '') === rel)) log(`tip: add "${rel}/" to .gitignore (cap-discovery init does)`)
}

// Where the toolkit lives (a private repo on GitHub Enterprise or github.com). Workflows reference it as
// owner/repo, which GitHub resolves on the same host; Claude Code needs the full git URL.
function toolkitLocation() {
  let pkgRepo
  try { const r = JSON.parse(fs.readFileSync(path.join(TOOLKIT, 'package.json'), 'utf8')).repository; pkgRepo = r?.url || r } catch {}
  const raw = String(opts.toolkit || process.env.CAP_DISCOVERY_TOOLKIT || pkgRepo || '').trim()
  const m = raw.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/+$/, '').match(/^(?:https?:\/\/([^/]+)\/)?([^/\s]+\/[^/\s]+)$/)
  if (!m) { log(`cannot tell where the toolkit lives from "${raw}"; pass --toolkit https://<host>/<owner>/<repo>`); process.exit(2) }
  const host = m[1] || opts.host || 'github.com', repo = m[2]
  return { host, repo, url: `https://${host}/${repo}.git` }
}

function init() {
  const T = path.join(TOOLKIT, 'templates', 'project')
  const ref = opts.ref || 'main'
  const tk = toolkitLocation()
  const write = (rel, content) => {
    const f = path.join(project, rel)
    if (fs.existsSync(f) && !opts.force) { log(`kept ${rel} (exists; --force overwrites)`); return }
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, content)
    log(`wrote ${rel}`)
  }
  const tpl = f => fs.readFileSync(path.join(T, f), 'utf8').replaceAll('{{REF}}', ref).replaceAll('{{REPO}}', tk.repo).replaceAll('{{URL}}', tk.url)
  write('discovery.config.json', tpl('discovery.config.json'))
  write('.github/workflows/discovery.yml', tpl('discovery.yml'))
  // Claude Code: offer the toolkit's plugin (agents + skills for the AI pass) to everyone who opens the repo.
  // A private repo works with the user's own git credentials for that host.
  const settings = path.join(project, '.claude', 'settings.json')
  let s = {}; try { s = JSON.parse(fs.readFileSync(settings, 'utf8')) } catch {}
  const source = tk.host === 'github.com' ? { source: 'github', repo: tk.repo } : { source: 'git', url: tk.url }
  s.extraKnownMarketplaces = { 'cap-discovery': { source }, ...s.extraKnownMarketplaces }
  s.enabledPlugins = { 'cap-discovery@cap-discovery': true, ...s.enabledPlugins }
  fs.mkdirSync(path.dirname(settings), { recursive: true })
  fs.writeFileSync(settings, JSON.stringify(s, null, 2) + '\n'); log(`updated .claude/settings.json (cap-discovery plugin from ${tk.url})`)
  const gi = path.join(project, '.gitignore')
  const txt = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : ''
  if (!/^\/?\.discovery\/?$/m.test(txt)) { fs.writeFileSync(gi, txt + (txt && !txt.endsWith('\n') ? '\n' : '') + '.discovery/\n'); log('added .discovery/ to .gitignore') }
  log(`next: commit these files. The workflow uses ${tk.repo}@${ref}; if that repo is private, allow access once: its Settings → Actions → General → Access`)
}

async function main() {
  switch (cmd) {
    case 'init': return init()
    case 'run': if (opts.install) await install(opts.install); await run(); if (opts.docs || cfg.docs) docs(opts.docs || cfg.docs); return
    case 'test': { const R = await test(); if (opts.docs || cfg.docs) docs(opts.docs || cfg.docs); return R.aftertests === 'failure' ? process.exit(1) : undefined }
    case 'all': { await install(opts.install || 'auto'); await run(); const R = await test(); if (opts.docs || cfg.docs) docs(opts.docs || cfg.docs); return R.aftertests === 'failure' ? process.exit(1) : undefined }
    case 'docs': return docs(opts.docs || pos[1] || cfg.docs || 'docs/discovery')
    case 'summary': return summary()
    case 'ai': {
      const sub = pos[1]
      if (sub === 'requests') return void node('ai-requests.js', [out])
      if (sub === 'merge') return void node('ai-merge.js', [out])
      if (['plan', 'prompt', 'check', 'status'].includes(sub)) return void node('ai-pass.js', [sub, out, ...pos.slice(2), ...argv.filter(a => ['--redo', '--json'].includes(a)), ...['limit', 'priority', 'kind', 'gap'].flatMap(k => opts[k] ? [`--${k}`, opts[k]] : [])])
      log('usage: cap-discovery ai requests|plan|prompt <gap>|check <gap>|merge|status'); process.exit(2)
    }
    case 'where': {
      const { det, appDir } = await where()
      console.log(JSON.stringify({ project, app: path.relative(project, appDir) || '.', ...det, out, reports, config: require('../lib/config').sources(), toolkit: TOOLKIT }, null, 1))
      return
    }
    default: log(`unknown command "${cmd}"`); usage(); process.exit(2)
  }
}
main().catch(e => { log(e.stack || e.message); process.exit(1) })
