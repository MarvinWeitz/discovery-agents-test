// Portable mode: the project's discovery.config.json over the toolkit defaults, and `cap-discovery init / where`
// on a throwaway project. The full run inside a real app is checked in CI (.github/workflows/portable.yml).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { merge } = require('../lib/config')

const CLI = path.join(__dirname, '..', 'bin', 'cap-discovery.js')
const cli = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a], { cwd, encoding: 'utf8', env: { ...process.env, DISCOVERY_CONFIG: '' } })

test('config: objects merge key by key, the rest replaces', () => {
  const m = merge({ mode: 'static', addons: { a: true, b: true }, atlas: { layout: 'pages' } }, { mode: 'static+ai', addons: { b: false } })
  assert.deepStrictEqual(m, { mode: 'static+ai', addons: { a: true, b: false }, atlas: { layout: 'pages' } })
})

test('config: the project file switches one addon off, the toolkit defaults keep the rest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-cfg-'))
  fs.writeFileSync(path.join(dir, 'discovery.config.json'), JSON.stringify({ addons: { mutation: false } }))
  const r = spawnSync(process.execPath, ['-e', "const a = require('./lib/addons'); console.log(JSON.stringify([a.enabled('mutation'), a.enabled('coverage')]))"],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, DISCOVERY_CONFIG: path.join(dir, 'discovery.config.json') } })
  assert.deepStrictEqual(JSON.parse(r.stdout), [false, true])
})

test('init writes config, workflow, Claude Code settings and the .gitignore line, and keeps what exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-init-'))
  fs.mkdirSync(path.join(dir, '.git'))
  fs.mkdirSync(path.join(dir, '.claude'))
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }))
  const r = cli(dir, 'init', '--ref', 'v1', '--toolkit', 'acme/cap-discovery')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(fs.readFileSync(path.join(dir, '.github/workflows/discovery.yml'), 'utf8'), /uses: acme\/cap-discovery@v1/)
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'))
  assert.deepStrictEqual(s.permissions, { allow: ['Bash(npm test)'] })
  assert.strictEqual(s.enabledPlugins['cap-discovery@cap-discovery'], true)
  assert.deepStrictEqual(s.extraKnownMarketplaces['cap-discovery'].source, { source: 'github', repo: 'acme/cap-discovery' })
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^\.discovery\/$/m)
  fs.writeFileSync(path.join(dir, 'discovery.config.json'), '{"mode":"static+ai"}')
  cli(dir, 'init')
  assert.strictEqual(fs.readFileSync(path.join(dir, 'discovery.config.json'), 'utf8'), '{"mode":"static+ai"}')
  assert.strictEqual(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').match(/\.discovery/g).length, 1)
})

test('init for a private toolkit repo on GitHub Enterprise: owner/repo in the workflow, git URL for Claude Code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-ghe-'))
  const r = cli(dir, 'init', '--toolkit', 'https://github.acme.corp/tools/cap-discovery.git')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(fs.readFileSync(path.join(dir, '.github/workflows/discovery.yml'), 'utf8'), /uses: tools\/cap-discovery@main/)
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'))
  assert.deepStrictEqual(s.extraKnownMarketplaces['cap-discovery'].source, { source: 'git', url: 'https://github.acme.corp/tools/cap-discovery.git' })
})

test('where finds the CAP app in a monorepo subfolder and reads the project config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-where-'))
  const app = path.join(dir, 'backend')
  for (const d of ['srv', 'db']) fs.mkdirSync(path.join(app, d), { recursive: true })
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'demo', dependencies: { '@sap/cds': '^9' } }))
  fs.writeFileSync(path.join(app, 'db', 'schema.cds'), 'namespace demo; entity Books { key ID : Integer; }')
  fs.writeFileSync(path.join(app, 'srv', 'cat.cds'), 'using demo from \'../db/schema\'; service Cat { entity Books as projection on demo.Books; }')
  fs.writeFileSync(path.join(dir, 'discovery.config.json'), '{"out":"build/discovery"}')
  const r = cli(dir, 'where')
  assert.strictEqual(r.status, 0, r.stderr)
  const w = JSON.parse(r.stdout)
  assert.strictEqual(w.app, 'backend')
  assert.strictEqual(w.out, path.join(dir, 'build', 'discovery'))
  assert.strictEqual(w.config.length, 2)
})
