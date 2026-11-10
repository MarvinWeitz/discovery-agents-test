// Product "Screen map": UI5 apps, their pages (routes) and the entities they show, and every UI promise
// (hidden, read-only, mandatory, side effect, operation available) with the server's verdict.
const svg = require('../svg')
const { table } = require('../md')

const VERDICT = { 'ui-only': { c: '#c2414b', t: 'UI only: the server does not check it' }, partial: { c: '#c27c0e', t: 'partly checked' }, consistent: { c: '#2f8a3a', t: 'server checks it too' }, framework: { c: '#3f7fbf', t: 'CAP enforces it' } }

module.exports = {
  id: 'screens', title: 'Screen map', step: 'UI5 and Fiori annotations', layer: 'ui',
  does: 'Apps, pages and the entities they show, and every UI promise with the server verdict (does the backend enforce what the UI shows?).',
  from: ['run/graph/ (UI5App, Route, UiRule)'],
  build(C) {
    const nodes = C.nodes(), edges = C.edges(), byId = C.byId()
    const apps = nodes.filter(n => n.type === 'UI5App'), rules = nodes.filter(n => n.type === 'UiRule')
    if (!apps.length && !rules.length) return { status: 'empty', why: 'no UI5 apps or UI annotations found', kpis: [{ label: 'apps', value: 0 }] }
    const out = (id, rel) => edges.filter(e => e.from === id && e.rel === rel).map(e => byId.get(e.to)).filter(Boolean)
    const ent = r => (r.props.entity || '').split('.').pop()
    const worst = list => ['ui-only', 'partial', 'consistent', 'framework'].find(v => list.some(r => r.props.verdict === v))
    const lv = [[], [], []]
    for (const a of apps) {
      lv[0].push({ id: a.id, label: a.props.name || a.id.split(':').pop(), color: svg.LAYER.ui })
      for (const r of out(a.id, 'has_route')) {
        const shows = out(r.id, 'shows')
        const rs = rules.filter(u => shows.some(s => ent(u) === (s.props.name || s.id).split('.').pop()))
        const w = worst(rs)
        lv[1].push({ id: r.id, label: `${r.props.name || r.id.split(':').pop()}${rs.length ? ` · ${rs.length} promises` : ''}`, parent: a.id, color: w ? VERDICT[w].c : svg.LAYER.ui, title: w ? VERDICT[w].t : '' })
        for (const s of shows) if (!lv[2].some(x => x.id === s.id)) lv[2].push({ id: s.id, label: (s.props.name || s.id).split('.').slice(-2).join('.'), parent: r.id, color: svg.LAYER.service })
      }
    }
    const counts = {}; for (const r of rules) counts[r.props.verdict] = (counts[r.props.verdict] || 0) + 1
    const verdicts = svg.bars(Object.keys(VERDICT).map(v => ({ label: `${v}: ${VERDICT[v].t}`, value: counts[v] || 0, color: VERDICT[v].c })), { title: 'UI promises by server verdict' })
    const md = [
      `${apps.length} apps · ${lv[1].length} pages · ${rules.length} UI promises, **${counts['ui-only'] || 0} only in the UI** (an OData client can bypass them).`, '',
      '![screen tree](views/screens.svg)', '', 'Page colour = worst verdict of the promises on the entity it shows (red UI only, amber partial, green consistent, blue CAP).', '',
      '![verdicts](views/verdicts.svg)', '',
      table(['Entity', 'Promise', 'UI says', 'Server', 'Verdict', 'Where'], rules.sort((a, b) => Object.keys(VERDICT).indexOf(a.props.verdict) - Object.keys(VERDICT).indexOf(b.props.verdict)).map(r => [ent(r), r.props.action || r.props.kind, r.props.ui || '', r.props.server || '', r.props.verdict, r.evidence]), { max: 25 }),
    ].join('\n')
    return {
      status: counts['ui-only'] ? 'warn' : 'ok',
      kpis: [{ label: 'apps', value: apps.length }, { label: 'pages', value: lv[1].length }, { label: 'UI promises', value: rules.length }, { label: 'UI only', value: counts['ui-only'] || 0, tone: counts['ui-only'] ? 'bad' : undefined }],
      md, views: { 'screens.svg': svg.columns(lv, { title: 'App → page → entity' }), 'verdicts.svg': verdicts },
      data: { 'ui-promises.json': rules.map(r => ({ id: r.id, ...r.props, evidence: r.evidence })) },
    }
  },
}
