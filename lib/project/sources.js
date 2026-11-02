// CDS sources as text, for evidence the compiled model does not carry (where an annotation is written).
// Walkthrough: docs/walkthrough/04-ui-promises.md
const fs = require('fs')
const path = require('path')
const { cdsSources } = require('./cap')

// Finds the annotation in the app's own CDS sources, so the UI side has file:line evidence too
function locator(root) {
  const files = cdsSources(root)
  const text = files.map(f => [path.relative(root, f), fs.readFileSync(f, 'utf8').split('\n')])
  // near: a string or RegExp that must appear close to the term; by default 4 lines above to 1 below,
  // with below = true only on the term's line or the 3 lines under it (an annotation above its declaration)
  return (term, near, below = false) => {
    const has = l => near instanceof RegExp ? near.test(l) : l.includes(near)
    for (const [rel, lines] of text) for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(term)) continue
      if (!near || (below ? lines.slice(i, i + 4) : lines.slice(Math.max(0, i - 4), i + 2)).some(has)) return `${rel}:${i + 1}`
    }
    return null
  }
}

module.exports = { locator }
