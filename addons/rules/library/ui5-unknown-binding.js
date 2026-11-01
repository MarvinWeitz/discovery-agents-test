// From the stress corpus (seeds ui5-binding-unknown-set, ui5-action-unknown, ui5-datasource-wrong-path): a UI5
// app of this project talks to a path its CAP service does not have. The manifest's OData dataSource points to no
// served path (close to one: a typo), or a view / controller binds an absolute path ({/Bookz}, bindContext
// ("/submitOrdr(...)")) that is neither an entity set nor an unbound action or function of the app's default
// service. At runtime the list stays empty or the button always fails; no CAP test sees it.
const fs = require('fs')
const path = require('path')
const { lev } = require('./_cap')
const norm = p => String(p || '').replace(/^\.?\/+|\/+$/g, '')
const JS_BIND = /\.(bindContext|bindList|bindElement|bindObject|bindProperty|bindItems|bindAggregation|bindRows)\s*\(\s*(\{[^}]*?path\s*:\s*)?["'`]\/([A-Za-z_]\w*)/g
const XML_BIND = /\{\s*\/([A-Za-z_]\w*)|\bpath\s*:\s*["']\/([A-Za-z_]\w*)/g

module.exports = {
  key: 'ui5-unknown-binding',
  title: 'UI5 app binds a path its CAP service does not serve',
  status: 'draft',
  from: 'stress corpus (2026-11-01): typos between UI5 apps and CAP services',
  i: 3, l: 3, lay: 'UI',
  test: 'OPA5 / sap.fe.test journey that opens the view and asserts the list has rows and the action succeeds.',
  detect({ root, g }) {
    const out = []
    if (!g || !root) return out
    const services = g.byType('Service').filter(s => !s.props.remote && s.props.path).map(s => ({ name: s.props.name, path: norm(s.props.path) }))
    if (!services.length) return out
    const svcOf = uri => services.find(s => norm(uri) === s.path || norm(uri).endsWith('/' + s.path))
    for (const app of g.byType('UI5App')) {
      const mf = path.join(root, app.props.manifest || '')
      let m; try { m = JSON.parse(fs.readFileSync(mf, 'utf8')) } catch { continue }
      const rel = path.relative(root, mf).split(path.sep).join('/'), raw = fs.readFileSync(mf, 'utf8')
      const ds = m['sap.app']?.dataSources || {}
      for (const [name, d] of Object.entries(ds)) {
        if ((d.type && d.type !== 'OData') || /^\w+:\/\//.test(d.uri || '') || svcOf(d.uri)) continue
        const last = norm(d.uri).split('/').pop()
        const near = services.filter(s => lev(s.path.split('/').pop(), last) <= 3)
        if (!near.length) continue // probably a remote API behind the approuter
        out.push({ ev: `${rel}:${lineOf(raw, `"${d.uri}"`)}`, t: `dataSource ${name} uses ${d.uri}, served nowhere (did you mean /${near[0].path}/?)`, d: `${rel} points the OData dataSource "${name}" to ${d.uri}, but this project serves ${services.map(s => '/' + s.path).join(', ')}. Every request of the app fails with 404.` })
      }
      const model = m['sap.ui5']?.models?.['']?.dataSource
      const svc = model && ds[model] && svcOf(ds[model].uri)
      if (!svc) continue
      const names = new Set([
        ...g.byType('ServiceEntity').filter(e => e.props.service === svc.name).map(e => e.props.name.split('.').pop()),
        ...g.byType('Action').filter(a => !a.props.bound && a.props.name.startsWith(svc.name + '.')).map(a => a.props.name.split('.').pop()),
        '$metadata',
      ])
      for (const f of files(path.dirname(mf))) {
        const text = fs.readFileSync(f, 'utf8'), frel = path.relative(root, f).split(path.sep).join('/')
        const re = f.endsWith('.xml') ? XML_BIND : JS_BIND
        for (const x of text.matchAll(re)) {
          const seg = f.endsWith('.xml') ? x[1] || x[2] : x[3]
          // a named model ({ path: '/x', model: 'view' }) is not the service
          const call = text.slice(x.index, (text.indexOf(')', x.index + x[0].length) + 1) || undefined)
          if (names.has(seg) || (!f.endsWith('.xml') && /model\s*:/.test(call))) continue
          const line = text.slice(0, x.index).split('\n').length
          const near = [...names].filter(n => lev(n, seg) <= 2)
          out.push({ ev: `${frel}:${line}`, t: `${path.basename(f)} binds /${seg}, not in ${svc.name}${near.length ? ` (did you mean ${near[0]}?)` : ''}`, d: `${frel}:${line} binds the absolute path /${seg} on the default model (${svc.name} at /${svc.path}), which has no entity set, action or function of that name. The binding fails or stays empty at runtime.` })
        }
      }
    }
    return out
  }
}

const lineOf = (text, s) => Math.max(1, text.slice(0, Math.max(0, text.indexOf(s))).split('\n').length)
function files(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'test', 'localService', 'dist'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) files(p, acc)
    else if (/\.(view|fragment)\.xml$|\.(js|ts)$/.test(e.name)) acc.push(p)
  }
  return acc
}
