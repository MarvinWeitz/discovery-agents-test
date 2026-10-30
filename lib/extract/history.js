// Step 5e · Git history: commits and changed lines per file (churn), used to rank slices.
// Walkthrough: docs/walkthrough/05-other-extractors.md
const { execFileSync } = require('child_process')

function extractHistory(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'log', '--numstat', '--format=@%H'], { encoding: 'utf8', maxBuffer: 64 << 20 })
    const churn = {}
    for (const line of out.split('\n')) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
      if (!m) continue
      const c = churn[m[3]] ||= { commits: 0, lines: 0 }
      c.commits++
      c.lines += (+m[1] || 0) + (+m[2] || 0)
    }
    const commits = (out.match(/^@/gm) || []).length
    return { commits, churn }
  } catch { return { commits: 0, churn: {} } }
}

module.exports = { extractHistory }
