// Drafted from agent finding A8 (cap-sflight): TravelID = max(TravelID) + 1 on CREATE; two parallel
// activations can read the same max and store the same id.
// Pattern: a handler reads max(<field>) and assigns it incremented.
module.exports = {
  key: 'max-plus-one-id',
  title: 'Sequential id from max() + 1 (race under parallel requests)',
  status: 'draft',
  from: 'agent finding A8 (cap-sflight, 2026-10-29)',
  i: 3, l: 2, lay: 'Node',
  test: 'Send two creates (or draft activations) in parallel; assert the ids differ, or enforce a unique key / DB sequence.',
  detect({ files }) {
    const out = []
    for (const f of files.filter(f => /\.(js|ts)$/.test(f.path))) {
      const lines = f.text.split('\n')
      lines.forEach((ln, i) => {
        const m = ln.match(/max\s*\(\s*(\w+)\s*\)(?:\s+as\s+(\w+))?/i)
        if (!m) return
        const alias = m[2] || m[1]
        const win = lines.slice(i, i + 6).join('\n')
        const inc = win.match(new RegExp(`(\\w+(?:\\.\\w+)*)\\s*=\\s*(?:\\+\\+\\s*${alias}\\b|${alias}\\s*\\+\\s*1\\b|\\(?\\s*${alias}\\s*(?:\\|\\||\\?\\?)\\s*0\\s*\\)?\\s*\\+\\s*1)`))
        if (!inc) return
        const line = i + 1 + win.slice(0, inc.index).split('\n').length - 1
        // per-draft numbering (NEW on a draft child, scoped by its parent) is single-user; skip it
        const reg = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
        if (/['"`]NEW['"`]/.test(reg) && !/CREATE|SAVE/.test(reg)) return
        const crit = /CREATE|SAVE/.test(reg) ? 'on CREATE (active rows, shared by all users)' : 'in a shared code path'
        out.push({ ev: `${f.path}:${line}`, t: `${m[1]} assigned as max + 1`, d: `${inc[1]} is set from max(${m[1]}) + 1 ${crit}. Two requests that read max() before either commits get the same value; without a unique constraint both rows are stored.` })
      })
    }
    return out
  }
}
