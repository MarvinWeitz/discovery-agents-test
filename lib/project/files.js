// File access shared by every step: walking folders, reading JSON, line numbers for evidence.
// Walks skip node_modules and dot folders (.git, .vscode, ...). Assumptions: docs/walkthrough/00-assumptions.md
const fs = require('fs')
const path = require('path')

// Folders never walked into, anywhere
const SKIP = ['node_modules']
const skipped = name => SKIP.includes(name) || name.startsWith('.')

// Every file under dir that passes filter (absolute paths, directory order); a missing dir gives []
function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipped(f.name)) continue
    const p = path.join(dir, f.name)
    f.isDirectory() ? walk(p, filter, out) : filter(p) && out.push(p)
  }
  return out
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }

// 1-based line of the first occurrence of needle (1 when not found)
const lineOf = (src, needle) => { const i = src.indexOf(needle); return i < 0 ? 1 : src.slice(0, i).split('\n').length }
// 1-based line of a character offset
const lineAt = (src, i) => src.slice(0, i).split('\n').length

module.exports = { walk, readJson, lineOf, lineAt, SKIP }
