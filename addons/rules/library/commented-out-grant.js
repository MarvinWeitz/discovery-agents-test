// Drafted from agent finding A2 (ui5-cap-event-app): the UPDATE grant is commented out behind a FIXME;
// the same shape caught cap-sflight's AnalyticsService, whose whole @restrict is commented out (A3).
// Pattern: a CDS comment that contains an authorization annotation or a privilege in a grant list.
module.exports = {
  key: 'commented-out-grant',
  title: 'Authorization commented out in CDS',
  status: 'draft',
  from: 'agent finding A2 (ui5-cap-event-app, 2026-10-29); same shape as A3 (cap-sflight)',
  i: 3, l: 3, lay: 'Service',
  test: 'Run the operation the commented grant was meant to cover as each role; assert the intended 200 / 403 per role.',
  detect({ files }) {
    const out = []
    for (const f of files.filter(f => f.path.endsWith('.cds'))) {
      const lines = f.text.split('\n')
      lines.forEach((ln, i) => {
        const c = ln.match(/\/\/(.*)$/); if (!c) return
        const body = c[1]
        const auth = /@\(?\s*(restrict|requires)\b/.test(body) || /\bgrant\s*:/.test(body) || (/^\s*['"](READ|CREATE|UPDATE|DELETE|WRITE|INSERT|UPSERT|NEW|EDIT|PATCH|SAVE|\*)['"]\s*,?/.test(body) && /grant/.test(lines.slice(Math.max(0, i - 8), i).join('\n')))
        if (!auth) return
        const prev = out[out.length - 1]
        if (prev && prev.file === f.path && prev.last === i) { prev.last = i + 1; return } // one finding per comment block
        const fixme = /FIXME|TODO|REVISIT|XXX/.test(body)
        out.push({ file: f.path, last: i + 1, ev: `${f.path}:${i + 1}`, t: `Commented-out ${/restrict|requires/.test(body) ? body.match(/restrict|requires/)[0] : 'grant'} in ${f.path.split('/').pop()}`, d: `${f.path}:${i + 1} has authorization in a comment: \`${body.trim().slice(0, 90)}\`.${fixme ? ' The comment is marked FIXME/TODO, so the gap is known but open.' : ''} Whatever it was meant to protect runs with the remaining grants only.` })
      })
    }
    return out.map(({ file, last, ...o }) => o)
  }
}
