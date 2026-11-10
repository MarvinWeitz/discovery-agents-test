// Markdown helpers for the step cards: tables that cap their rows, so a big app keeps short cards.
const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

function table(head, rows, { max = 15, more = 'more rows in the data file' } = {}) {
  if (!rows.length) return '_none_\n'
  const L = [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`]
  for (const r of rows.slice(0, max)) L.push(`| ${r.map(cell).join(' | ')} |`)
  if (rows.length > max) L.push(`| … ${rows.length - max} ${more} |${' |'.repeat(head.length - 1)}`)
  return L.join('\n') + '\n'
}

const kpiLine = kpis => kpis.map(k => `**${k.value}** ${k.label}`).join(' · ')

module.exports = { table, kpiLine, cell }
