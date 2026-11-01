// One corpus case = a base app (stress/apps/<base>) plus the edits of one seed (stress/seeds/<base>.js).
// materialize() copies the base into stress/.work/<case>/app and applies the edits; every edit must
// apply exactly once, so a seed can never silently become a no-op when the base app changes.
const fs = require('fs')
const path = require('path')

const STRESS = path.join(__dirname, '..')
const WORK = process.env.STRESS_WORK || path.join(STRESS, '.work')

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (['node_modules', 'gen', 'dist', '.work'].includes(e.name)) continue
    const a = path.join(from, e.name), b = path.join(to, e.name)
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b)
  }
}

// edits: { file, find, replace } | { file, write } | { file, append } | { file, delete: true } | { move: [from, to] }
//        | { file, json: obj => void } (edit a JSON file in place)
function applyEdits(root, edits = []) {
  for (const e of edits) {
    if (e.move) {
      const [a, b] = e.move.map(p => path.join(root, p))
      fs.mkdirSync(path.dirname(b), { recursive: true }); fs.renameSync(a, b); continue
    }
    const f = path.join(root, e.file)
    if (e.delete) { fs.rmSync(f, { recursive: true, force: false }); continue }
    if (e.write != null) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, e.write); continue }
    if (e.append != null) { fs.appendFileSync(f, e.append); continue }
    if (e.json) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); e.json(j); fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); continue }
    const text = fs.readFileSync(f, 'utf8')
    const n = text.split(e.find).length - 1
    if (n !== 1) throw new Error(`edit on ${e.file}: "${String(e.find).slice(0, 60)}" found ${n} times, expected exactly once`)
    fs.writeFileSync(f, text.replace(e.find, () => e.replace))
  }
}

function materialize(id, base, edits, extra = []) {
  const dir = path.join(WORK, id), root = path.join(dir, 'app')
  fs.rmSync(dir, { recursive: true, force: true })
  copyDir(path.join(STRESS, 'apps', base), root)
  applyEdits(root, edits)
  applyEdits(root, extra)
  return { dir, root, out: path.join(dir, 'out') }
}

function loadSeeds() {
  const dir = path.join(STRESS, 'seeds')
  return fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().flatMap(f => {
    const m = require(path.join(dir, f))
    return m.seeds.map(s => ({ base: m.base, ...s, group: s.group || m.group || m.base, file: `seeds/${f}` }))
  })
}

function bases() { return fs.readdirSync(path.join(STRESS, 'apps')).filter(d => fs.existsSync(path.join(STRESS, 'apps', d, 'stress.json'))).sort() }
const baseConf = b => JSON.parse(fs.readFileSync(path.join(STRESS, 'apps', b, 'stress.json'), 'utf8'))

module.exports = { STRESS, WORK, materialize, applyEdits, loadSeeds, bases, baseConf, copyDir }
