// Addon "rules": agent findings promoted into deterministic rules (addons/rules/library). Each rule
// has a unit test; drafts are reported next to the agent finding they reproduce, accepted rules add
// risks to the atlas and retire the agent finding. Off: "rules": false. Remove: delete addons/rules
// (and .github/workflows/rules.yml).
const fs = require('fs')
const path = require('path')
const { sources, run } = require('./engine')

const near = (a, b) => { const [fa, la] = String(a).split(':'), [fb, lb] = String(b).split(':'); return fa === fb && Math.abs(+la - +lb) <= 2 }
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

function facts(D, { g, csn, root, out }) {
  const res = run({ root, files: sources(root), g, csn })
  const agent = D.RISKS.filter(r => r.src === 'agent')
  for (const r of res) r.reproduces = [...new Set(r.hits.flatMap(h => agent.filter(a => near(a.ev, h.ev)).map(a => a.id)))]
  // accepted rules become rule risks and retire the agent findings they reproduce
  const acc = res.filter(r => r.status === 'accepted')
  const retired = new Set(acc.flatMap(r => r.reproduces))
  let n = D.RISKS.filter(r => r.src !== 'agent').length
  const added = acc.flatMap(r => r.hits.map(h => ({ src: 'rule', key: `rule:${r.key}@${h.ev}`, id: 'G' + ++n, t: h.t, d: h.d, i: r.i, l: r.l, lay: r.lay, ev: h.ev, test: r.test })))
  D.RISKS = [...D.RISKS.filter(r => r.src !== 'agent'), ...added, ...D.RISKS.filter(r => r.src === 'agent' && !retired.has(r.id))]
  D.RULES = { rules: res.map(({ key, title, status, from, hits, reproduces, error }) => ({ key, title, status, from, hits, reproduces, error })) }
  const drafts = res.filter(r => r.status === 'draft'), hit = drafts.filter(r => r.hits.length)
  const take = `${res.length} rules drafted from agent findings: ${acc.length} accepted, ${drafts.length} waiting for review. ${hit.length} drafts fire on this app${hit.some(r => r.reproduces.length) ? `, reproducing agent finding${hit.flatMap(r => r.reproduces).length > 1 ? 's' : ''} <b>${[...new Set(hit.flatMap(r => r.reproduces))].join(', ')}</b> without AI` : ''}.`
  const i = D.SECTIONS.findIndex(s => s.code === 'RLS'), sec = { code: 'RLS', name: 'Rules from agent findings', take, views: [{ k: 'A', label: 'Rule cards' }] }
  if (i >= 0) D.SECTIONS[i] = sec; else { const r = D.SECTIONS.findIndex(s => s.code === 'RSK'); D.SECTIONS.splice(r >= 0 ? r + 1 : D.SECTIONS.length, 0, sec) }
  D.META.sources = { ...D.META.sources, RLS: 'generated (rules library)' }
  if (out) {
    fs.mkdirSync(path.join(out, 'pr'), { recursive: true })
    fs.writeFileSync(path.join(out, 'pr', 'rules.md'), ['### Rules from agent findings', '', '| Rule | Status | Hits here | Reproduces |', '| --- | --- | --- | --- |',
      ...res.map(r => `| \`${r.key}\` ${cell(r.title)} | ${r.status} | ${r.error ? 'error: ' + cell(r.error) : r.hits.map(h => '`' + h.ev + '`').join(', ') || '–'} | ${r.reproduces.join(', ') || '–'} |`), ''].join('\n'))
  }
}

const topics = {
  RLS: D => ['Rules drafted by agents from their own findings, reviewed and accepted like code. A draft only reports; an accepted rule adds risks and retires the agent finding it reproduces. Each rule has a unit test in `addons/rules/library/<key>.test.js`.', '',
    '| Rule | Status | Drafted from | Hits on this app | Reproduces agent finding |', '| --- | --- | --- | --- | --- |',
    ...D.RULES.rules.map(r => `| \`${r.key}\` ${cell(r.title)} | ${r.status} | ${cell(r.from)} | ${r.error ? 'error: ' + cell(r.error) : r.hits.map(h => '`' + h.ev + '` ' + cell(h.t)).join('<br>') || '–'} | ${r.reproduces.join(', ') || '–'} |`)].join('\n')
}

module.exports = { facts, topics, views: path.join(__dirname, 'view.js') }
