// Product "API surface": every service as standard API documents. OData $metadata (EDMX, already
// written by discover), OpenAPI 3 via @cap-js/openapi and AsyncAPI via @cap-js/asyncapi (both
// Apache-2.0, run on the compiled CSN; peer dependency @sap/cds = the customer's or toolkit's install).
// L2 is Redoc (MIT), the standard OpenAPI reader, loaded from a CDN on the page.
const fs = require('fs')
const path = require('path')

const OPS = ['GET', 'POST', 'PATCH', 'DELETE', 'action']

// the compilers log notes to stdout; keep the stage's last line ("said") clean
function tryCompile(mod, csn, opts) {
  const keep = ['log', 'info', 'warn'].map(k => [k, console[k]]); for (const [k] of keep) console[k] = () => {}
  try { return { doc: require(mod).compile(csn, opts) } } catch (e) { return { error: `${mod}: ${String(e.message).split('\n')[0]}` } } finally { for (const [k, f] of keep) console[k] = f }
}

const redoc = (title, spec) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0}</style></head><body><div id="redoc"></div>
<script src="https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js"></script>
<script>Redoc.init(${JSON.stringify(spec).replace(/</g, '\\u003c')}, { hideDownloadButton: false, expandResponses: '200' }, document.getElementById('redoc'))</script></body></html>`

module.exports = {
  id: 'api', title: 'API surface', step: 'EDMX, OpenAPI, AsyncAPI', layer: 'service',
  does: 'Every service, entity set, operation and action as standard API documents (OData EDMX, OpenAPI 3, AsyncAPI), with the guard on each.',
  from: ['run/csn.json', 'run/edmx/', 'atlas-data.json API'],
  build(C) {
    const F = C.facts(), api = F.API || [], csn = C.csn()
    if (!api.length && !csn) return { status: 'empty', why: 'no services found' }
    const data = {}, pages = {}, notes = []
    for (const f of (C.exists(path.join(C.run, 'edmx')) ? fs.readdirSync(path.join(C.run, 'edmx')) : [])) data[`edmx/${f}`] = fs.readFileSync(path.join(C.run, 'edmx', f), 'utf8')
    let paths = 0, events = 0
    for (const s of api) {
      if (!csn) break
      const oa = tryCompile('@cap-js/openapi', csn, { service: s.svc })
      if (oa.doc) { data[`openapi/${s.svc}.json`] = oa.doc; pages[`openapi-${s.svc}.html`] = redoc(`${s.svc} API`, oa.doc); paths += Object.keys(oa.doc.paths || {}).length } else notes.push(oa.error)
      const aa = tryCompile('@cap-js/asyncapi', csn, { service: s.svc })
      const ev = aa.doc?.channels ? Object.keys(aa.doc.channels).length : 0
      if (ev) { data[`asyncapi/${s.svc}.json`] = aa.doc; events += ev } else if (aa.error) notes.push(aa.error)
    }
    // surface: entity sets × operations, coloured by guard (open / role / readonly)
    const rows = []
    for (const s of api) for (const [set, ops, guard, note] of s.sets || []) {
      const has = String(ops).split(/[ ,/·]+/).map(o => o.toUpperCase())
      rows.push({ service: s.svc, set, ops, guard: guard || '', note: note || '', open: guard === 'open' ? 1 : 0,
        _label: `${s.svc}.${set}`, _cells: OPS.map(o => (o === 'action' ? (s.actions || []).some(a => a[0]?.startsWith?.(set) || a.entity === set) : has.includes(o)) ? { text: guard === 'open' ? 'open' : guard, color: guard === 'open' ? '#c27c0e' : '#138a7e', title: `${set} ${o}: ${guard}${note ? ' · ' + note : ''}` } : null) })
    }
    const surface = {
      title: 'Service surface', noun: 'entity sets', what: 'Every entity set and the operations it allows, coloured by its guard (amber = no role needed).',
      columns: [{ key: 'service', label: 'Service', facet: true }, { key: 'set', label: 'Entity set' }, { key: 'guard', label: 'Guard', facet: true }, { key: 'note', label: 'Note' }, { key: 'open', label: 'Open without role', num: true, hide: true }],
      rows, sort: { key: 'open', dir: 'desc' }, chart: { kind: 'matrix', label: '_label', cols: OPS, cw: 70, title: 'Entity set × operation (amber = no role needed)' },
    }
    const md = [
      `${api.length} services · ${rows.length} entity sets · ${paths} OpenAPI paths · ${events} AsyncAPI channels.`, '',
      api.slice(0, 12).map(s => `- **${s.svc}** \`${s.root}\`: ${Object.keys(data).filter(k => k.includes(s.svc)).map(k => `[${k.split('/')[0]}](data/${k})`).join(' · ')}${pages[`openapi-${s.svc}.html`] ? ` · [read it in Redoc](openapi-${s.svc}.html)` : ''}`).join('\n'), '',
      api.length > 12 ? `- … ${api.length - 12} more services: their documents are in [data/openapi](data/openapi/) and [data/edmx](data/edmx/)\n` : '',
      '### Service surface', '', 'Open entity sets first.', '', '{{list:surface}}',
      events ? '' : '_No events declared: nothing for AsyncAPI to describe._\n',
      notes.length ? `Not produced: ${notes.join('; ')}\n` : '',
    ].join('\n')
    return {
      status: 'ok',
      kpis: [{ label: 'services', value: api.length }, { label: 'entity sets', value: rows.length }, { label: 'OpenAPI paths', value: paths }, { label: 'open without role', value: api.flatMap(s => s.sets || []).filter(r => r[2] === 'open').length, tone: 'warn' }],
      md, lists: { surface }, data, pages,
    }
  },
}
