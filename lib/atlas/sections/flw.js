// Atlas section FLW · Data flow: handler writes (Sankey), busiest handler (swimlane), hook timeline. Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const { short } = require('../../analyse/authz')
const { base, hev, uniq, cut, tgtOf } = require('../util')

const VERB = { UPDATE: 'PATCH', CREATE: 'POST', NEW: 'POST', DELETE: 'DELETE', SAVE: 'POST draftActivate', READ: 'GET' }
function flw(g) {
  const hs = g.byType('Handler')
  const sideFx = g.byType('UiRule').filter(r => r.props.kind === 'side-effects')
  const N = [], L = [], idx = n => { let i = N.indexOf(n); if (i < 0) { N.push(n); i = N.length - 1 } return i }
  const entFields = {}
  const flows = []
  for (const h of hs) {
    const writes = g.out(h.id, 'writes').filter(w => w.props.sets && Object.keys(w.props.sets).length)
    const ders = g.out(h.id, 'enforces').map(e => g.nodes.get(e.to)).filter(r => r?.props.kind === 'derivation')
    if (!writes.length && !ders.length) continue
    const trig = !h.props.events.some(e => VERB[e]) ? `${h.props.events.join('/')} on ${short(tgtOf(g, h))}` : `${h.props.events.map(e => VERB[e] || e).join('/')} ${short(tgtOf(g, h))}${h.props.drafts ? ' (draft)' : ''}`
    const hn = `${h.props.phase} · ${hev(h)}`
    for (const w of writes) flows.push([trig, hn, short(w.to), Object.keys(w.props.sets)])
    for (const r of ders) flows.push([trig, hn, short(tgtOf(g, h)), [r.props.field]])
  }
  for (const [, , e, fs] of flows) entFields[e] = uniq([...(entFields[e] || []), ...fs])
  const entNode = e => `${e}: ${entFields[e].slice(0, 3).join(', ')}${entFields[e].length > 3 ? ', …' : ''}`
  const add = (a, b, v) => { const s = idx(a), t = idx(b); const l = L.find(x => x[0] === s && x[1] === t); if (l) l[2] += v; else L.push([s, t, v]) }
  for (const [trig, hn, e, fs] of flows) { add(trig, hn, fs.length); add(hn, entNode(e), fs.length) }
  for (const r of sideFx) {
    const e = short(r.props.entity); if (!entFields[e]) continue
    const tg = (r.props.targets || []).filter(t => entFields[e].includes(t)).length || 1
    add(entNode(e), 'SideEffects re-read', tg)
  }
  // swimlane: the handler with the most writes and rules
  const score = h => g.out(h.id, 'writes').reduce((a, w) => a + Object.keys(w.props.sets || {}).length, 0) + g.out(h.id, 'enforces').length
  const top = [...hs].sort((a, b) => score(b) - score(a) || a.props.line - b.props.line)[0]
  let SWIM = null
  if (top && score(top)) {
    const ent = short(tgtOf(g, top)), ev0 = top.props.events[0]
    const steps = [{ a: 0, b: 2, t: VERB[ev0] ? `${VERB[ev0]} ${ent}${top.props.drafts ? '(draft)' : ''}` : `POST ${ent}(…)/${ev0}`, c: 'ac' }]
    const items = [
      ...g.out(top.id, 'enforces').map(e => g.nodes.get(e.to)).filter(Boolean).map(r => ({ line: +r.evidence.split(':').pop(), r })),
      ...g.out(top.id, 'writes').map(w => ({ line: +String(w.evidence).split(':').pop(), w }))
    ].sort((a, b) => a.line - b.line)
    if (top.props.phase === 'on' && top.props.delegates) steps.push({ a: 2, b: 3, t: 'next(): default write' })
    for (const it of items.slice(0, 6)) {
      if (it.r?.props.kind === 'rejection') steps.push({ a: 2, b: 0, t: `${it.r.props.guard ? 'if ' + cut(it.r.props.guard, 44) + ': ' : ''}reject ${it.r.props.status || 400}${it.r.props.message ? ' "' + cut(it.r.props.message, 30) + '"' : ''}`, sub: it.r.evidence, c: 'cr' })
      else if (it.r?.props.kind === 'derivation') steps.push({ a: 2, b: 3, t: `${it.r.props.field} = ${cut(it.r.props.expr, 40)}`, sub: it.r.evidence })
      else if (it.r) steps.push({ a: 2, b: 3, t: `${it.r.props.kind === 'conditional-write' ? 'write only if' : it.r.props.kind} ${cut(it.r.props.guard, 54)}`, sub: it.r.evidence })
      else { const s = Object.entries(it.w.props.sets || {}); steps.push({ a: 2, b: 3, t: `${it.w.props.via} ${short(it.w.to)}${s.length ? ' SET ' + cut(s.map(([k]) => k).join(', '), 50) : ''}`, sub: it.w.evidence }) }
    }
    steps.push({ a: 2, b: 0, t: '200 OK' })
    const fx = sideFx.find(r => short(r.props.entity) === ent)
    if (fx) { steps.push({ a: 0, b: 1, t: cut(`SideEffects: ${fx.props.ui}`, 70), sub: fx.evidence, c: 'wn' }); steps.push({ a: 0, b: 2, t: `GET ${ent}(…) re-read targets`, c: 'ac' }) }
    SWIM = { title: `${top.props.phase} ${top.props.events.join('/')} ${ent}`, handler: `${top.props.phase} ${top.props.events.join('/')}`, ev: hev(top), lanes: ['Fiori UI', 'SideEffects', `${short(top.props.service)} · Node`, 'Database'], steps }
  }
  // hooks per draft event
  const EV = ['NEW draft', 'PATCH draft', 'DELETE', 'SAVE (activate)', 'CREATE / UPDATE', 'READ', 'Actions']
  const col = h => {
    const c = new Set()
    for (const e of h.props.events) c.add(e === 'NEW' ? 0 : e === 'UPDATE' && h.props.drafts ? 1 : e === 'DELETE' ? 2 : e === 'SAVE' || e === 'draftActivate' ? 3 : ['CREATE', 'UPDATE', '*'].includes(e) ? 4 : e === 'READ' ? 5 : 6)
    return [...c]
  }
  const NODE = EV.map(() => []), UI = EV.map(() => [])
  for (const h of hs) for (const c of col(h)) NODE[c].push([`${h.props.phase} ${h.props.events.join('/')} ${short(tgtOf(g, h))}`, hev(h)])
  const ucol = { CreateHidden: 0, 'field-control': 1, 'side-effects': 1, DeleteHidden: 2, mandatory: 3, readonly: 4, 'operation-available': 6, 'assert.range': 6 }
  for (const r of g.byType('UiRule')) { const c = ucol[r.props.kind]; if (c === undefined) continue; UI[c].push([`${r.props.kind === 'operation-available' ? r.props.action + ': ' : ''}${r.props.ui}`.slice(0, 48), r.evidence ? `${base(r.evidence.split(':')[0])}:${r.evidence.split(':').pop()}` : 'annotation', r.props.verdict === 'ui-only' ? 1 : 0]) }
  const keep = EV.map((_, i) => NODE[i].length || UI[i].length)
  return { SANKEY_NODES: N, SANKEY_LINKS: L, SWIM, HOOK_EVENTS: EV.filter((_, i) => keep[i]), HOOK_NODE: NODE.filter((_, i) => keep[i]), HOOK_UI: UI.filter((_, i) => keep[i]) }
}

module.exports = { flw, VERB }
