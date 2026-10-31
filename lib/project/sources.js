// CDS sources as text, for evidence the compiled model does not carry (where an annotation is written).
// Walkthrough: docs/walkthrough/04-ui-promises.md
const fs = require('fs')
const path = require('path')
const { cdsSources } = require('./cap')

// Finds the annotation in the app's own CDS sources, so the UI side has file:line evidence too
function locator(root) {
  const files = cdsSources(root)
  const text = files.map(f => [path.relative(root, f), fs.readFileSync(f, 'utf8').split('\n')])
  return (term, near) => {
    for (const [rel, lines] of text) for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(term)) continue
      if (!near || lines.slice(Math.max(0, i - 4), i + 2).some(l => l.includes(near))) return `${rel}:${i + 1}`
    }
    return null
  }
}

module.exports = { locator }
