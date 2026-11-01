// The evidence gate: a claim is accepted only when its file:line exists in the app and its quote is
// within two lines of that line (whitespace ignored). Used for agent facts (bin/merge.js) and AI answers
// to gaps (bin/ai-merge.js). It proves that the cited code exists, not that the reasoning is right.
// Walkthrough: docs/walkthrough/12-ai-loop.md (D3)
const fs = require('fs')
const path = require('path')

const WINDOW = 2
const MIN_QUOTE = 8
const norm = s => String(s).replace(/\s+/g, ' ').trim()

// evidence as "path:line" or { file, line }; returns null when accepted, else the reason
function checkEvidence(root, evidence, quote) {
  let file, line
  if (evidence && typeof evidence === 'object') ({ file, line } = evidence)
  else { const m = /^(.+):(\d+)$/.exec(evidence || ''); if (!m) return 'evidence is not path:line'; file = m[1]; line = +m[2] }
  if (!file || !Number.isInteger(+line)) return 'evidence is not path:line'
  const abs = path.resolve(root, file)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return `file ${file} does not exist`
  const lines = fs.readFileSync(abs, 'utf8').split('\n')
  if (line < 1 || line > lines.length) return `line ${line} outside ${file} (${lines.length} lines)`
  if (!quote || norm(quote).length < MIN_QUOTE) return `quote missing or shorter than ${MIN_QUOTE} characters`
  const window = norm(lines.slice(Math.max(0, line - 1 - WINDOW), line + WINDOW).join(' '))
  return window.includes(norm(quote)) ? null : `quote not found near ${file}:${line}`
}

module.exports = { checkEvidence, WINDOW, MIN_QUOTE }
