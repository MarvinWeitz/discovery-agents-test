// Addon "nextsteps": ranks what to do next across every atlas section (P1–P3, impact × likelihood)
// and gives each item a prompt for a coding agent. On the page: a "Next steps" panel under every
// section, a NXT section with all items, and a tray that combines the selected items into one
// prompt. Runs when the atlas is built (prepare hook), so it always reflects the latest facts,
// including coverage and mutation results added later. Off: "nextsteps": false. Remove: delete
// addons/nextsteps.
const path = require('path')
const { build, KIND } = require('./nextsteps')

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

function prepare(D) {
  D.NEXT = build(D)
  const c = D.NEXT.counts, secs = new Set(D.NEXT.items.flatMap(x => x.secs))
  const take = `${D.NEXT.items.length} next steps from ${secs.size} sections, ranked by impact × likelihood: <b>${c.P1} P1</b> (do now), ${c.P2} P2, ${c.P3} P3. Tick several and copy one combined prompt for a coding agent, as a plan, a change, or tests only.`
  const sec = { code: 'NXT', name: 'Next steps', take, views: [{ k: 'A', label: 'Ranked list' }, { k: 'B', label: 'Priority matrix' }, { k: 'C', label: 'By section' }] }
  D.SECTIONS = [sec, ...D.SECTIONS.filter(s => s.code !== 'NXT')]
  D.KPIS = D.KPIS.filter(k => k[1] !== 'P1 next steps').concat([[String(c.P1), 'P1 next steps', c.P1 ? 'c' : '']])
  D.META.sources = { ...D.META.sources, NXT: 'generated from the other sections' }
}

const row = x => `| ${x.band} | \`${cell(x.id)}\` | ${KIND[x.kind]} | ${cell(x.title)} | ${x.secs.join(', ')} | ${x.ev.map(e => '`' + e + '`').join(', ')} | ${x.i}×${x.l} |`
const head = ['| Priority | Id | Step | What | Sections | Evidence | Score |', '| --- | --- | --- | --- | --- | --- | --- |']

const topics = {
  NXT: D => {
    const N = D.NEXT, P = N.prompt
    return [`Priority = impact × likelihood (1–5 each): P1 ≥ 16, P2 ≥ 9, P3 below. An item that several sections point at (same file:line) is listed once.`, '',
      ...head, ...N.items.map(row), '',
      '## Prompts', '',
      'To hand items to a coding agent, paste the header, then the blocks of the items you want, then one closing instruction.', '',
      '### Header', '', '```text', P.header, '```', '',
      ...Object.values(P.modes).flatMap(m => [`### Closing: ${m.label}`, '', '```text', m.text, '```', '']),
      '### Item blocks', '', ...N.items.flatMap(x => ['```text', x.block, '```', ''])].join('\n')
  }
}

// a short "Next steps" table at the end of every other topic file
function topicAppend(code, D) {
  if (code === 'NXT' || !D.NEXT) return ''
  const mine = D.NEXT.items.filter(x => x.secs.includes(code))
  if (!mine.length) return ''
  return ['## Next steps', '', `Ranked; prompts for each item are in the NXT topic file.`, '', ...head, ...mine.slice(0, 15).map(row), ...(mine.length > 15 ? ['', `${mine.length - 15} more in the NXT topic file.`] : [])].join('\n')
}

module.exports = { prepare, topics, topicAppend, views: path.join(__dirname, 'view.js') }
