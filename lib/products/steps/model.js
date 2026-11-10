// Product "Model map": the CDS model as CAP compiled it (run/csn.json and the graph built from it):
// entities, compositions and associations, the projection chain from db entity to service entity, and
// what depends on each entity (impact analysis, lib/products/impact.js). L2 is an interactive explorer.
const fs = require('fs')
const path = require('path')
const svg = require('../svg')
const { table } = require('../md')
const I = require('../impact')

const slug = s => s.replace(/[^A-Za-z0-9_.-]+/g, '_')

module.exports = {
  id: 'model', title: 'Model map', step: 'cds compile (CSN)', layer: 'model',
  does: 'Entities, compositions, associations and the projection chain from database to service, plus what depends on each entity when it changes.',
  from: ['run/csn.json', 'run/graph/'],
  build(C) {
    const nodes = C.nodes(), edges = C.edges()
    if (!nodes.length) return { status: 'empty', why: 'no graph in run/graph' }
    const G = I.compact(nodes, edges)
    const N = new Map(G.nodes.map(n => [n.id, n]))
    const ents = G.nodes.filter(n => n.type === 'Entity' && !/\.texts$/.test(n.label))
    const sents = G.nodes.filter(n => n.type === 'ServiceEntity')
    const rel = r => G.edges.filter(e => e[1] === r && N.get(e[0])?.type === 'Entity')
    // blast radius of every db entity, depth 3, without associations
    const ranking = ents.map(e => { const res = I.impact(G, e.id, { depth: 3 }); const by = {}; for (const r of res) by[N.get(r.id).layer] = (by[N.get(r.id).layer] || 0) + 1; return { id: e.id, label: e.label, ev: e.ev, total: res.length, by, res } }).sort((a, b) => b.total - a.total)
    const impactFiles = {}
    for (const r of ranking) impactFiles[`impact/${slug(r.label)}.md`] = I.markdown(G, r.id, r.res, { depth: 3 })
    const keys = Object.keys(I.LAYERS).map(k => ({ key: k, label: I.LAYERS[k], color: svg.LAYER[k] }))
    // which services expose an entity (db entity <- projects_on - service entity <- exposes - service)
    const proj = G.edges.filter(e => e[1] === 'projects_on'), expo = G.edges.filter(e => e[1] === 'exposes')
    const svcOf = se => expo.filter(x => x[2] === se).map(x => N.get(x[0])?.label).filter(Boolean)
    const entities = {
      title: 'What depends on each entity', noun: 'entities', what: 'For each database entity, how many things depend on it within 3 steps, by layer. Open "impact" for the list, or the explorer to walk it.',
      columns: [{ key: 'entity', label: 'Entity' }, { key: 'exposedBy', label: 'Exposed by', facet: true }, { key: 'total', label: 'Depends on it', num: true }, ...keys.map(k => ({ key: k.key, label: k.label, num: true })), { key: 'detail', label: 'Detail' }],
      rows: ranking.map(r => ({ entity: r.label, exposedBy: [...new Set(proj.filter(p => p[2] === r.id).flatMap(p => svcOf(p[0])))], total: r.total, ...Object.fromEntries(keys.map(k => [k.key, r.by[k.key] || 0])), detail: `[impact](data/impact/${slug(r.label)}.md)` })),
      sort: { key: 'total', dir: 'desc' }, chart: { kind: 'stacked', label: 'entity', keys, title: 'What depends on each entity (3 steps)' },
    }
    // projection chain: db entity -> service entities
    const projections = {
      title: 'Projection chain', noun: 'projections', what: 'Each database entity and the service entities that project on it: a change on the left reaches everything to its right.',
      columns: [{ key: 'entity', label: 'Database entity', facet: true }, { key: 'svcentity', label: 'Service entity' }, { key: 'service', label: 'Service', facet: true }],
      rows: proj.filter(p => N.get(p[2])?.type === 'Entity' && ents.some(e => e.id === p[2])).map(p => ({ entity: N.get(p[2]).label, svcentity: N.get(p[0]).label, service: svcOf(p[0])[0] || '', _path: [{ id: p[2], label: N.get(p[2]).label, color: svg.LAYER.model }, { id: p[0], label: N.get(p[0]).label, color: svg.LAYER.service }] })),
      sort: { key: 'entity', dir: 'asc' }, chart: { kind: 'columns', title: 'Projection chain: database entity → service entities' },
    }
    // Mermaid ER diagram of the db entities, only while it stays readable; past that the explorer draws any part
    const mid = s => s.replace(/[^A-Za-z0-9_]/g, '_')
    const er = ['erDiagram']
    for (const [a, r, b] of G.edges) if ((r === 'composes' || r === 'associates') && N.get(a)?.type === 'Entity' && N.get(b)?.type === 'Entity' && !/\.texts$/.test(N.get(b).label)) er.push(`  ${mid(N.get(a).label)} ${r === 'composes' ? '||--o{' : '}o--||'} ${mid(N.get(b).label)} : "${r === 'composes' ? 'composes' : 'refers to'}"`)
    const ER_MAX = 15
    const top = ranking[0]
    const md = [
      `${ents.length} database entities${G.ns ? ` in \`${G.ns}\`` : ''} · ${sents.length} service entities · ${rel('composes').length} compositions · ${rel('associates').length} associations.`, '',
      '**Explore it:** [interactive model and impact explorer](explorer.html) (pick any entity, see what it affects; graph, rings or layers).', '',
      '### What depends on each entity', '', '{{list:entities}}',
      '### Projection chain', '', '{{list:projections}}',
      '### Entity relationships', '', ents.length <= ER_MAX ? ['```mermaid', er.join('\n'), '```', ''].join('\n') : `_${ents.length} entities are too many for one diagram. The [explorer](explorer.html) draws the part around any entity._\n`,
      'Ask the same from the command line: `node bin/query.js <out> impact <Entity> [--depth 3] [--assoc]`.',
    ].join('\n')
    return {
      status: 'ok',
      kpis: [{ label: 'entities', value: ents.length }, { label: 'service entities', value: sents.length }, { label: 'compositions', value: rel('composes').length }, { label: `things depend on ${top?.label || '-'}`, value: top?.total || 0 }],
      md, lists: { entities, projections },
      data: { 'model-graph.json': G, 'impact.json': ranking.map(({ res, ...r }) => r), ...impactFiles },
      pages: { 'explorer.html': fs.readFileSync(path.join(__dirname, '..', 'pages', 'explorer.html'), 'utf8').replace('__GRAPH__', JSON.stringify(G).replace(/</g, '\\u003c')).replace('__LAYERS__', JSON.stringify({ names: I.LAYERS, colors: svg.LAYER })).replace('__RULES__', JSON.stringify({ A: I.A_DEP, B: I.B_DEP, STOP: I.STOP })) },
    }
  },
}
