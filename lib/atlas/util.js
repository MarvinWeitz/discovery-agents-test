// Small helpers shared by the atlas section builders.
const path = require('path')

const base = f => path.basename(f)
const hev = h => `${base(h.props.file)}:${h.props.line}`
const uniq = a => [...new Set(a)]
const cut = (t, n) => { t = String(t ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t }
// entity a handler works on; for action handlers the entity that owns the bound action
const tgtOf = (g, h) => h.props.target || g.out(h.id, 'handles').map(e => e.to).find(t => t.startsWith('action:'))?.replace(/^action:/, '').split('.').slice(0, -1).join('.') || h.props.service

module.exports = { base, hev, uniq, cut, tgtOf }
