// Product "Behaviour matrix": which handler code runs for which entity, event and phase, and the rules
// inside it (derivations, rejections, conditional writes), from the handler AST in the graph.

const PHASES = ['before', 'on', 'after']

module.exports = {
  id: 'behaviour', title: 'Behaviour matrix', step: 'Handler AST', layer: 'code',
  does: 'Which code runs for which entity, event and phase, which rules it applies and which helpers it calls.',
  from: ['run/graph/ (Handler, Rule, Helper)'],
  build(C) {
    const nodes = C.nodes(), edges = C.edges()
    const H = nodes.filter(n => n.type === 'Handler'), Rl = nodes.filter(n => n.type === 'Rule')
    if (!H.length) return { status: 'empty', why: 'no handlers found (generic CAP only, or code the parser cannot read)', kpis: [{ label: 'handlers', value: 0 }] }
    // an action handler's entity is the one its bound action belongs to
    const actionOf = h => edges.find(e => e.from === h.id && e.rel === 'handles' && e.to.startsWith('action:'))?.to
    const tgt = h => (h.props.target || h.props.targets?.[0] || (actionOf(h) ? actionOf(h).split(':')[1].split('.').slice(-2, -1)[0] : null) || h.props.service || '?').split('.').slice(-1)[0] || '?'
    const events = [...new Set(H.flatMap(h => h.props.events || []))]
    const cols = PHASES.flatMap(p => events.filter(e => H.some(h => h.props.phase === p && (h.props.events || []).includes(e))).map(e => `${p} ${e}`))
    const rows = [...new Set(H.map(tgt))].sort()
    const rulesOf = h => edges.filter(e => e.from === h.id && e.rel === 'enforces').map(e => nodes.find(n => n.id === e.to)).filter(Boolean)
    const svcOf = r => H.find(h => tgt(h) === r)?.props.service?.split('.').pop() || ''
    const matrix = {
      title: 'Entity × phase and event', noun: 'entities', what: 'Which handlers run for which entity, phase and event (n handlers · r rules inside them). Hover a cell for the code locations.',
      columns: [{ key: 'entity', label: 'Entity' }, { key: 'service', label: 'Service', facet: true }, { key: 'handlers', label: 'Handlers', num: true }, { key: 'rules', label: 'Rules', num: true }],
      rows: rows.map(r => {
        const mine = H.filter(h => tgt(h) === r)
        return { entity: r, service: svcOf(r), handlers: mine.length, rules: mine.reduce((a, h) => a + rulesOf(h).length, 0), _cells: cols.map(c => {
          const [p, ev] = c.split(' '); const hs = mine.filter(h => h.props.phase === p && (h.props.events || []).includes(ev))
          if (!hs.length) return null
          const nr = hs.reduce((a, h) => a + rulesOf(h).length, 0)
          return { text: nr ? `${hs.length}·${nr}r` : String(hs.length), color: p === 'before' ? '#3f7fbf' : p === 'on' ? '#b26a00' : '#8a4fc4', title: hs.map(h => `${h.evidence}${rulesOf(h).length ? ' · ' + rulesOf(h).map(r => r.props.kind).join(', ') : ''}`).join('\n') }
        }) }
      }),
      sort: { key: 'handlers', dir: 'desc' }, chart: { kind: 'matrix', label: 'entity', cols, cw: 62, title: 'Entity × phase and event (n handlers · r rules)' },
    }
    const handlers = {
      title: 'Handlers', noun: 'handlers', what: 'Every handler with its phase, events, entity and the rules inside it.',
      columns: [{ key: 'phase', label: 'Phase', facet: true }, { key: 'events', label: 'Events', facet: true }, { key: 'entity', label: 'Entity', facet: true }, { key: 'rules', label: 'Rules' }, { key: 'nrules', label: 'Rule count', num: true, hide: true }, { key: 'where', label: 'Where' }],
      rows: H.map(h => ({ phase: h.props.phase, events: h.props.events || [], entity: tgt(h), rules: rulesOf(h).map(r => r.props.kind + (r.props.field ? ' ' + r.props.field : '')).join(', '), nrules: rulesOf(h).length, where: h.evidence })),
      sort: { key: 'nrules', dir: 'desc' },
    }
    const kinds = {}; for (const r of Rl) kinds[r.props.kind] = (kinds[r.props.kind] || 0) + 1
    const helpers = nodes.filter(n => n.type === 'Helper')
    // a Mermaid sequence for the busiest entity: request -> before -> on -> after
    const busiest = rows.map(r => [r, H.filter(h => tgt(h) === r).length]).sort((a, b) => b[1] - a[1])[0]?.[0]
    const seq = ['sequenceDiagram', '  participant Client', `  participant CAP as CAP runtime`, `  participant Code as handlers for ${busiest}`, '  participant DB']
    const SEQ_MAX = 12, theirs = H.filter(h => tgt(h) === busiest)
    for (const h of theirs.slice().sort((a, b) => PHASES.indexOf(a.props.phase) - PHASES.indexOf(b.props.phase)).slice(0, SEQ_MAX)) {
      seq.push(`  Client->>CAP: ${(h.props.events || []).join('/')} ${busiest}`, `  CAP->>Code: ${h.props.phase} (${h.evidence})`)
      for (const r of rulesOf(h)) seq.push(`  Note over Code: ${r.props.kind}${r.props.field ? ' ' + r.props.field : ''}`)
      if (h.props.phase === 'on') seq.push('  Code->>DB: query')
    }
    const md = [
      `${H.length} handlers on ${rows.length} entities · ${Rl.length} rules (${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}) · ${helpers.length} helpers.`, '',
      '{{list:matrix}}',
      '### Handlers', '', '{{list:handlers}}',
      `### Request lifecycle: ${busiest}`, '', '{{block:sequence}}',
    ].join('\n')
    return {
      status: 'ok',
      kpis: [{ label: 'handlers', value: H.length }, { label: 'rules', value: Rl.length }, { label: 'rejections', value: kinds.rejection || 0 }, { label: 'helpers', value: helpers.length }],
      md, lists: { matrix, handlers }, blocks: { sequence: ['```mermaid', seq.join('\n'), '```', theirs.length > SEQ_MAX ? `\n_First ${SEQ_MAX} of ${theirs.length} handlers on ${busiest}; all of them in [handlers](browse.html#handlers?entity=${encodeURIComponent(busiest)})._` : ''].join('\n') }, data: { 'handlers.json': H.map(h => ({ id: h.id, ...h.props, evidence: h.evidence, rules: rulesOf(h).map(r => ({ id: r.id, ...r.props, evidence: r.evidence })) })) },
    }
  },
}
