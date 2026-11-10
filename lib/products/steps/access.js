// Product "Access map": who can do what. Rows = operations, columns = users (one per role), cells =
// the static verdict from the CDS model and, after a CI run, what the running app answered.

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
    const cellOf = (i, j) => {
      const s = v(A[i].c[j]), m = mcell(i, j)
      const [t, col] = CELL[s] || [s, '#999']
      const diff = m && m.st === 'differ'
      return { text: m ? (diff ? `≠ ${m.measured}` : `✓ ${s}`) : s, color: diff ? '#c2414b' : col, title: `${A[i].op} as ${R[j][0]}: ${t}${m ? ` · measured ${m.measured} (${m.status})` : ''}` }
    }
    const matrix = {
      title: 'Operation × user', noun: 'operations', what: 'y allowed, n denied, r open without a role, a unclear. After a CI run: ✓ the running app agreed, ≠ it answered differently.',
      columns: [{ key: 'service', label: 'Service', facet: true }, { key: 'op', label: 'Operation' }, { key: 'open', label: 'Open without role', facet: true }, { key: 'measured', label: 'Measured', facet: true }, { key: 'where', label: 'Where' }],
      rows: A.map((r, i) => {
        const cells = R.map((u, j) => cellOf(i, j)), diff = cells.some(c => c.text.startsWith('≠'))
        return { service: r.svc, op: r.op, open: r.c.some(c => v(c) === 'r') ? 'yes' : 'no', measured: !M ? 'not measured' : diff ? 'differs' : 'agrees', where: r.ev, _label: `${r.svc.replace(/Service$/, '')} · ${r.op}`, _cells: cells, rank: (diff ? 100 : 0) + (r.c.some(c => v(c) === 'r') ? 10 : 0) }
      }),
      sort: { key: 'rank', dir: 'desc' }, chart: { kind: 'matrix', label: '_label', cols: R.map(r => r[1]), cw: 74, title: 'Operation × user' },
    }
    matrix.columns.push({ key: 'rank', label: 'Attention', num: true, hide: true })
    const open = A.filter(r => r.c.some(c => v(c) === 'r')).length
    const md = [
      `${A.length} operations × ${R.length} users. ${open} operations are open to users without a role.${M ? ` **Measured in CI:** ${M.agree} cells agree, ${M.differ} differ, ${M.unclear} were unclear and are now settled.` : ' Not measured in this run (CI sends the probe with the measured addon).'}`, '',
      'First the operations that need attention (measured differs, then open without a role).', '',
      '{{list:matrix}}',
      'Ask: `node bin/query.js <out> who-can <operation text>`.',
    ].join('\n')
    return {
      status: M?.differ ? 'bad' : open ? 'warn' : 'ok',
      kpis: [{ label: 'operations', value: A.length }, { label: 'users', value: R.length }, { label: 'open without role', value: open, tone: open ? 'warn' : undefined }, { label: M ? 'measured cells differ' : 'measured', value: M ? M.differ : 'not yet', tone: M?.differ ? 'bad' : undefined }],
      md, lists: { matrix }, data: { 'access.json': { users: R, rows: A, measured: M || null } },
    }
  },
}
