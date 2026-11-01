// Finds the toolkit's own packages wherever the package manager put them. In the toolkit's repo they sit in
// ./node_modules; installed into a project (npm i -D, npx) they are usually hoisted next to the toolkit,
// i.e. in a node_modules folder above it. Node's lookup order: the nearest node_modules up the tree.
//   dir('playwright')               folder of the package, or null
//   bin('eslint')                   [node, <its bin script>] to run with execFileSync, or null
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
// a few machines keep shared tools in a fixed place (this toolkit's sandbox has Playwright there)
const EXTRA = ['/opt/node-tools/node_modules']

function dir(pkg) {
  for (let d = ROOT; ; d = path.dirname(d)) {
    const p = path.join(d, 'node_modules', pkg)
    if (fs.existsSync(path.join(p, 'package.json'))) return p
    if (path.dirname(d) === d) break
  }
  return EXTRA.map(e => path.join(e, pkg)).find(p => fs.existsSync(path.join(p, 'package.json'))) || null
}

function bin(pkg, name) {
  const d = dir(pkg)
  if (!d) return null
  const b = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).bin
  const rel = typeof b === 'string' ? b : b?.[name || Object.keys(b || {})[0]]
  return rel ? [process.execPath, path.join(d, rel)] : null
}

module.exports = { dir, bin, ROOT }
