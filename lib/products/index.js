// Stage "products": every step of the run publishes its own product under <out>/steps/<id>/, in four
// depths, so each one can be read on its own, by a person or an agent, while the run goes on:
//   L0 summary.json     3-5 numbers and a status (run overview, PR comment)
//   L1 README.md        short Markdown card with pictures (views/*.svg) and the top items; agents read this
//   L2 *.html           an explorer: a proven viewer where one exists (Redoc, Stryker report), our own only
//                       where none does (model and impact explorer); index.html renders the card
//   L3 data/            the full data in a standard format where one exists (EDMX, OpenAPI, SARIF, CTRF, …)
// <out>/steps/index.md and index.html are the start page; products.json lists every product.
// With --base <other-out>, each summary also carries the change of every number since that run.
// Step modules: lib/products/steps/*.js, each { id, title, step, layer, does, from, build(ctx) }.
// Walkthrough: docs/walkthrough/14-step-products.md
const fs = require('fs')
const path = require('path')
const { ctx } = require('./ctx')
const html = require('./html')
const LV = require('./listview')
const svg = require('./svg')
const { config } = require('../config')

const ORDER = ['run', 'project', 'model', 'api', 'behaviour', 'screens', 'access', 'checks', 'history', 'findings', 'ai', 'testdesign', 'tests', 'coverage', 'mutation']
const STEPS = ORDER.map(id => require(`./steps/${id}`))

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 1))
}

function delta(kpis, base) {
  if (!base?.kpis) return kpis
  return kpis.map(k => { const b = base.kpis.find(x => x.label === k.label); return b && typeof k.value === 'number' && typeof b.value === 'number' && b.value !== k.value ? { ...k, delta: k.value - b.value } : k })
}

// the card block of one list: all rows when the list is short, else the top rows and a link to browse.html
// (products.inline: longest list shown whole, products.preview: rows shown otherwise, 0 = link only)
function listBlock(id, L, lim) {
  const rows = LV.apply(L), n = rows.length, noun = L.noun || 'rows'
  if (!n) return { md: (L.empty || '_none_') + '\n' }
  const full = n <= (L.inline ?? lim.inline), shown = full ? rows : rows.slice(0, lim.preview)
  const pic = shown.length ? LV.chart(L, shown, svg) : ''
  const link = b => `[${b}${full ? '' : ` all ${n}`} with filters](browse.html#${id}) · [${id}.json](data/lists/${id}.json)`
  const md = [
    ...(pic ? [`![${L.chart.title || L.title}](views/${id}.svg)\n`] : []),
    ...(shown.length ? [LV.markdown(L, shown) + '\n'] : []),
    full ? `_${n} ${noun}_ · ${link('browse')}\n` : `**Top ${shown.length} of ${n} ${noun}** by ${LV.sortLabel(L)}. ${link('Browse')}\n`,
  ].join('\n')
  return { md, svg: pic }
}

function build(out, opts = {}) {
  const C = ctx(out, opts)
  const cfg = config().products || {}
  const lim = { inline: opts.inline ?? cfg.inline ?? 12, preview: opts.preview ?? cfg.preview ?? 10 }
  const dir = path.join(out, 'steps')
  fs.rmSync(dir, { recursive: true, force: true })
  const list = []
  for (const S of STEPS) {
    let r
    try { r = S.build(C) || { status: 'empty' } } catch (e) { r = { status: 'failed', why: String(e.message).split('\n')[0] } }
    if (r.lists && Object.keys(r.lists).length) {
      r.views = { ...(r.views || {}) }; r.data = { ...(r.data || {}) }; r.pages = { ...(r.pages || {}) }
      for (const [id, L] of Object.entries(r.lists)) {
        const b = listBlock(id, L, lim)
        r.md = String(r.md || '').replace(`{{list:${id}}}`, () => b.md)
        if (b.svg) r.views[`${id}.svg`] = b.svg
        r.data[`lists/${id}.json`] = { title: L.title, columns: L.columns, sort: L.sort, rows: L.rows.map(x => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('_')))) }
      }
      r.pages['browse.html'] = html.browsePage(S, r.lists, C)
    }
    const base = opts.base ? C.json(path.join(opts.base, 'steps', S.id, 'summary.json')) : null
    const kpis = delta(r.kpis || [], base)
    const summary = { id: S.id, title: S.title, step: S.step, layer: S.layer, status: r.status, why: r.why || null, kpis, from: S.from, views: Object.keys(r.views || {}).map(v => `views/${v}`), pages: Object.keys(r.pages || {}), data: Object.keys(r.data || {}).map(d => `data/${d}`), lists: Object.fromEntries(Object.entries(r.lists || {}).map(([k, L]) => [k, L.rows.length])) }
    const d = path.join(dir, S.id)
    const deeper = [...summary.pages.map(p => `[${p}](${p})`), ...summary.data.filter(f => !f.includes('/impact/') && !f.includes('/lists/')).slice(0, 12).map(f => `[${f.replace(/^data\//, '')}](${f})`)]
    const md = [
      '---', `product: ${S.id}`, `step: ${S.step}`, `status: ${r.status}`, `generated: ${new Date().toISOString().slice(0, 16)}Z`, '---', '',
      `# ${S.title}`, '', `_${S.step}_ · ${S.does}`, '',
      kpis.some(k => k.delta) ? `Since the base run: ${kpis.filter(k => k.delta).map(k => `${k.label} ${k.delta > 0 ? '+' : ''}${k.delta}`).join(' · ')}\n` : '',
      r.why ? `> ${r.status === 'not-run' ? 'Not run here' : r.status === 'failed' ? 'Failed' : 'Nothing to show'}: ${r.why}\n` : '',
      r.md || '', '',
      deeper.length ? `**Deeper:** ${deeper.join(' · ')}\n` : '',
      `Read from: ${S.from.map(f => '`' + f + '`').join(', ')} · [all products](../index.md)`, '',
    ].join('\n')
    write(path.join(d, 'summary.json'), summary)
    write(path.join(d, 'README.md'), md)
    for (const [f, c] of Object.entries(r.views || {})) write(path.join(d, 'views', f), c)
    for (const [f, c] of Object.entries(r.data || {})) write(path.join(d, 'data', f), c)
    for (const [f, c] of Object.entries(r.pages || {})) write(path.join(d, f), c)
    list.push({ ...summary, does: S.does })
  }
  for (const s of list) write(path.join(dir, s.id, 'index.html'), html.stepPage(s, fs.readFileSync(path.join(dir, s.id, 'README.md'), 'utf8'), list, C))
  write(path.join(dir, 'products.json'), list)
  write(path.join(dir, 'index.md'), html.hubMd(list, C))
  write(path.join(dir, 'index.html'), html.hubPage(list, C))
  const shown = list.filter(s => ['ok', 'warn', 'bad'].includes(s.status)).length
  return { list, said: `${list.length} step products → ${dir} (${shown} with results, ${list.filter(s => s.status === 'not-run').length} not run here, ${list.filter(s => s.status === 'failed').length} failed)` }
}

module.exports = { build, STEPS, ORDER }
