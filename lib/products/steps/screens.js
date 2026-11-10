// Product "Screen map": UI5 apps, their pages (routes) and the entities they show, and every UI promise
// (hidden, read-only, mandatory, side effect, operation available) with the server's verdict.
const svg = require('../svg')

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
    const pages = []
    for (const a of apps) {
      const an = a.props.name || a.id.split(':').pop()
      for (const r of out(a.id, 'has_route')) {
        const shows = out(r.id, 'shows')
        const rs = rules.filter(u => shows.some(s => ent(u) === (s.props.name || s.id).split('.').pop()))
        const w = worst(rs), rn = r.props.name || r.id.split(':').pop()
        const base = [{ id: a.id, label: an, color: svg.LAYER.ui }, { id: r.id, label: `${rn}${rs.length ? ` · ${rs.length} promises` : ''}`, color: w ? VERDICT[w].c : svg.LAYER.ui, title: w ? VERDICT[w].t : '' }]
        for (const s of (shows.length ? shows : [null])) pages.push({ app: an, page: rn, entity: s ? (s.props.name || s.id).split('.').slice(-2).join('.') : '', promises: rs.length, worst: w || 'none', uiOnly: rs.filter(x => x.props.verdict === 'ui-only').length, _path: s ? [...base, { id: s.id, label: (s.props.name || s.id).split('.').slice(-2).join('.'), color: svg.LAYER.service }] : base })
      }
    }
    const screenList = {
      title: 'App → page → entity', noun: 'pages', what: 'Each page of each app and the entity it shows. Page colour = worst verdict of the promises on that entity (red UI only, amber partial, green consistent, blue CAP).',
      columns: [{ key: 'app', label: 'App', facet: true }, { key: 'page', label: 'Page' }, { key: 'entity', label: 'Entity' }, { key: 'worst', label: 'Worst verdict', facet: true }, { key: 'promises', label: 'Promises', num: true }, { key: 'uiOnly', label: 'UI only', num: true }],
      rows: pages, sort: { key: 'uiOnly', dir: 'desc' }, chart: { kind: 'columns', title: 'App → page → entity' },
    }
    const promises = {
      title: 'UI promises', noun: 'promises', what: 'Every UI promise (hidden, read-only, mandatory, side effect, operation available) and whether the server enforces it too.',
      columns: [{ key: 'entity', label: 'Entity', facet: true }, { key: 'promise', label: 'Promise', facet: true }, { key: 'ui', label: 'UI says' }, { key: 'server', label: 'Server' }, { key: 'verdict', label: 'Verdict', facet: true }, { key: 'rank', label: 'Severity', num: true, hide: true }, { key: 'where', label: 'Where' }],
      rows: rules.map(r => ({ entity: ent(r), promise: r.props.action || r.props.kind, ui: r.props.ui || '', server: r.props.server || '', verdict: r.props.verdict, rank: 3 - Object.keys(VERDICT).indexOf(r.props.verdict), where: r.evidence })),
      sort: { key: 'rank', dir: 'desc' },
    }
    const counts = {}; for (const r of rules) counts[r.props.verdict] = (counts[r.props.verdict] || 0) + 1
    const verdicts = svg.bars(Object.keys(VERDICT).map(v => ({ label: `${v}: ${VERDICT[v].t}`, value: counts[v] || 0, color: VERDICT[v].c })), { title: 'UI promises by server verdict' })
    const md = [
      `${apps.length} apps · ${new Set(pages.map(p => p.app + p.page)).size} pages · ${rules.length} UI promises, **${counts['ui-only'] || 0} only in the UI** (an OData client can bypass them).`, '',
      '![verdicts](views/verdicts.svg)', '',
      '### Pages', '', 'Pages with the most UI-only promises first.', '', '{{list:screens}}',
      '### UI promises', '', 'UI-only first.', '', '{{list:promises}}',
    ].join('\n')
    return {
      status: counts['ui-only'] ? 'warn' : 'ok',
      kpis: [{ label: 'apps', value: apps.length }, { label: 'pages', value: new Set(pages.map(p => p.app + p.page)).size }, { label: 'UI promises', value: rules.length }, { label: 'UI only', value: counts['ui-only'] || 0, tone: counts['ui-only'] ? 'bad' : undefined }],
      md, views: { 'verdicts.svg': verdicts }, lists: { screens: screenList, promises },
      data: { 'ui-promises.json': rules.map(r => ({ id: r.id, ...r.props, evidence: r.evidence })) },
    }
  },
}
