// Product "Access map": who can do what. Rows = operations, columns = users (one per role), cells =
// the static verdict from the CDS model and, after a CI run, what the running app answered.
const svg = require('../svg')
const { table } = require('../md')

const CELL = { y: ['allowed', '#2f8a3a'], n: ['denied', '#8c959f'], r: ['open: no role needed', '#c27c0e'], a: ['unclear', '#3f7fbf'] }

module.exports = {
  id: 'access', title: 'Access map', step: 'Authorization', layer: 'access',
  does: 'Who can do what: operation × user/role, declared in CDS, and measured against the running app when the CI run sent the probe.',
  from: ['atlas-data.json AUTH, ROLES, MEASURED'],
  build(C) {
    const F = C.facts(), A = F.AUTH || [], R = F.ROLES || []
    if (!A.length) return { status: 'empty', why: 'no authorization rows' }
    const M = F.MEASURED?.authz
    const mcell = (i, j) => M?.rows?.find(r => r.row === i)?.cells?.[j]
    const v = c => (typeof c === 'object' ? c.v : c)
    const view = svg.matrix(A.map(r => `${r.svc.replace(/Service$/, '')} · ${r.op}`), R.map(r => r[1]), (i, j) => {
      const s = v(A[i].c[j]), m = mcell(i, j)
      const [t, col] = CELL[s] || [s, '#999']
      const diff = m && m.st === 'differ'
      return { text: m ? (diff ? `≠ ${m.measured}` : `✓ ${s}`) : s, color: diff ? '#c2414b' : col, title: `${A[i].op} as ${R[j][0]}: ${t}${m ? ` · measured ${m.measured} (${m.status})` : ''}` }
    }, { title: 'Operation × user (y allowed, n denied, r open without role, a unclear; ✓ measured agrees, ≠ differs)', cw: 74 })
    const open = A.filter(r => r.c.some(c => v(c) === 'r')).length
    const md = [
      `${A.length} operations × ${R.length} users. ${open} operations are open to users without a role.${M ? ` **Measured in CI:** ${M.agree} cells agree, ${M.differ} differ, ${M.unclear} were unclear and are now settled.` : ' Not measured in this run (CI sends the probe with the measured addon).'}`, '',
      '![access matrix](views/matrix.svg)', '',
      table(['Service', 'Operation', ...R.map(r => r[0]), 'Where'], A.map((r, i) => [r.svc, r.op, ...r.c.map((c, j) => v(c) + (mcell(i, j) ? (mcell(i, j).st === 'differ' ? ` ≠${mcell(i, j).measured}` : ' ✓') : '')), r.ev]), { max: 30 }),
      'Ask: `node bin/query.js <out> who-can <operation text>`.',
    ].join('\n')
    return {
      status: M?.differ ? 'bad' : open ? 'warn' : 'ok',
      kpis: [{ label: 'operations', value: A.length }, { label: 'users', value: R.length }, { label: 'open without role', value: open, tone: open ? 'warn' : undefined }, { label: M ? 'measured cells differ' : 'measured', value: M ? M.differ : 'not yet', tone: M?.differ ? 'bad' : undefined }],
      md, views: { 'matrix.svg': view }, data: { 'access.json': { users: R, rows: A, measured: M || null } },
    }
  },
}
