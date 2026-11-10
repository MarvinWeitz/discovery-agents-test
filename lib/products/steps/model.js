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
    const top = ranking.filter(r => r.total).slice(0, 12)
    const keys = Object.keys(I.LAYERS).map(k => ({ key: k, label: I.LAYERS[k], color: svg.LAYER[k] }))
    const blast = svg.stacked(top.map(r => ({ label: r.label, parts: keys.map(k => ({ key: k.key, value: r.by[k.key] || 0 })) })), keys, { title: 'What depends on each entity (3 steps)' })
    // projection chain: db entity -> service entities -> services
    const proj = G.edges.filter(e => e[1] === 'projects_on'), expo = G.edges.filter(e => e[1] === 'exposes')
    const chainEnts = ents.filter(e => proj.some(p => p[2] === e.id))
    const l2 = []
    for (const p of proj) if (chainEnts.some(e => e.id === p[2])) l2.push({ id: p[0], label: N.get(p[0]).label, parent: p[2], color: svg.LAYER.service })
            const l2sorted = l2.sort((a, b) => chainEnts.findIndex(e => e.id === a.parent) - chainEnts.findIndex(e => e.id === b.parent))
    const chain = svg.columns([chainEnts.map(e => ({ id: e.id, label: e.label, color: svg.LAYER.model })), l2sorted], { title: 'Projection chain: database entity → service entities' })
    // Mermaid ER diagram of the db entities (GitHub renders it; the HTML page renders it with mermaid)
    const mid = s => s.replace(/[^A-Za-z0-9_]/g, '_')
    const er = ['erDiagram']
    for (const [a, r, b] of G.edges) if ((r === 'composes' || r === 'associates') && N.get(a)?.type === 'Entity' && N.get(b)?.type === 'Entity' && !/\.texts$/.test(N.get(b).label)) er.push(`  ${mid(N.get(a).label)} ${r === 'composes' ? '||--o{' : '}o--||'} ${mid(N.get(b).label)} : "${r === 'composes' ? 'composes' : 'refers to'}"`)
    const md = [
      `${ents.length} database entities${G.ns ? ` in \`${G.ns}\`` : ''} · ${sents.length} service entities · ${rel('composes').length} compositions · ${rel('associates').length} associations.`, '',
      '**Explore it:** [interactive model and impact explorer](explorer.html) (click an entity to see what it affects; graph, rings or layers).', '',
      '### What depends on each entity', '', '![blast radius](views/blast-radius.svg)', '',
      table(['Entity', 'Depends on it', ...Object.values(I.LAYERS), 'Detail'], ranking.map(r => [r.label, r.total, ...Object.keys(I.LAYERS).map(k => r.by[k] || ''), `[impact](data/impact/${slug(r.label)}.md)`]), { max: 20 }),
      '### Projection chain', '', 'Each database entity and the service entities that project on it (a change to the left reaches everything to its right).', '', '![projection chain](views/projections.svg)', '',
      '### Entity relationships', '', '```mermaid', er.join('\n'), '```', '',
      'Ask the same from the command line: `node bin/query.js <out> impact <Entity> [--depth 3] [--assoc]`.',
    ].join('\n')
    return {
      status: 'ok',
      kpis: [{ label: 'entities', value: ents.length }, { label: 'service entities', value: sents.length }, { label: 'compositions', value: rel('composes').length }, { label: `things depend on ${top[0]?.label || '-'}`, value: top[0]?.total || 0 }],
      md, views: { 'blast-radius.svg': blast, 'projections.svg': chain },
      data: { 'model-graph.json': G, 'impact.json': ranking.map(({ res, ...r }) => r), ...impactFiles },
      pages: { 'explorer.html': fs.readFileSync(path.join(__dirname, '..', 'pages', 'explorer.html'), 'utf8').replace('__GRAPH__', JSON.stringify(G).replace(/</g, '\\u003c')).replace('__LAYERS__', JSON.stringify({ names: I.LAYERS, colors: svg.LAYER })).replace('__RULES__', JSON.stringify({ A: I.A_DEP, B: I.B_DEP, STOP: I.STOP })) },
    }
  },
}
