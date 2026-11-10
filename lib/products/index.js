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
const REASONS = require('./reasons')

// the reason for one item of a product: exact name, else a prefix entry ('impact/', 'openapi-'), else '*'
function reasonFor(id, name) {
  for (const R of [REASONS[id] || {}, REASONS['*']]) {
    if (R[name]) return R[name]
    const k = Object.keys(R).find(k => /[/-]$/.test(k) && name.startsWith(k))
    if (k) return R[k]
  }
  return null
}
const reasonLine = r => `_${r.cause}_ **Next:** ${r.then}\n`

const ORDER = ['run', 'project', 'model', 'api', 'behaviour', 'screens', 'errors', 'access', 'checks', 'history', 'risk', 'findings', 'ai', 'testdesign', 'tests', 'coverage', 'mutation']
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

// with --base: which items of a list are new or gone since that run, by the list's key column (L.key, else
// the first column); a row whose key stays but whose numbers move is not an item change
function itemDelta(L, base) {
  if (!base?.rows) return null
  const k = L.key || L.columns[0].key, key = r => LV.plain(r[k])
  const was = new Set(base.rows.map(key)), now = new Set(L.rows.map(key))
  const added = [...now].filter(x => !was.has(x)), removed = [...was].filter(x => !now.has(x))
  return added.length + removed.length ? { added, removed } : null
}
// steps/changes.md (with --base): every number and every list item that moved since the base run, one place
function changesMd(list, base) {
  const L = ['# Changes since the base run', '', `Base: \`${base}\`. Numbers that moved and items that are new or gone, per product. The PR diff comment (addons/diff) adds tests to run, messages, risks and authorization.`, '']
  let any = false
  for (const s of list) {
    const k = (s.kpis || []).filter(x => x.delta), c = Object.entries(s.changes || {})
    if (!k.length && !c.length) continue
    any = true
    L.push(`## [${s.title}](${s.id}/README.md)`, '')
    if (k.length) L.push(k.map(x => `${x.label} ${x.delta > 0 ? '+' : ''}${x.delta}`).join(' · '), '')
    for (const [id, D] of c) L.push(`- **${id}**: ${[D.added.length && `+${D.added.length} ${D.added.slice(0, 8).join(', ')}${D.added.length > 8 ? ', …' : ''}`, D.removed.length && `−${D.removed.length} ${D.removed.slice(0, 8).join(', ')}${D.removed.length > 8 ? ', …' : ''}`].filter(Boolean).join(' · ')} ([browse](${s.id}/browse.html#${id}))`)
    if (c.length) L.push('')
  }
  if (!any) L.push('_Nothing moved._', '')
  return L.join('\n')
}
const deltaLine = (D, noun) => `Since the base run: ${[D.added.length && `**+${D.added.length}** ${noun} (${D.added.slice(0, 5).join(', ')}${D.added.length > 5 ? ', …' : ''})`, D.removed.length && `**−${D.removed.length}** (${D.removed.slice(0, 5).join(', ')}${D.removed.length > 5 ? ', …' : ''})`].filter(Boolean).join(' · ')}\n`

// steps/reasoning.md: every item of every product with its question, cause, form and next step, and every
// data file and page with who reads it; items without a reason are listed so they get one or go
function reasoningMd(list) {
  const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const L = ['# Why each view, list and file is there', '', 'Every picture, list and diagram in the step products answers a question someone has. This file keeps the reasoning: the question, why it matters, why this form, and what to do with the answer. Source: `lib/products/reasons.js`.', '']
  for (const s of list) {
    const items = [...s.views.map(v => v.replace(/^views\//, '')).filter(v => !s.lists?.[v.replace(/\.svg$/, '')]), ...Object.keys(s.lists || {}), ...(s.blocks || [])]
    const files = [...s.pages, ...s.data.map(d => d.replace(/^data\//, ''))].filter(f => !/^lists\/|^impact\/.+/.test(f) || f === 'lists/')
    if (!items.length && !files.length) continue
    L.push(`## ${s.title}`, '', `_${s.step}_ · [card](${s.id}/README.md)`, '')
    if (items.length) {
      L.push('| Shows | Question | Why it matters | Why this form | Next |', '| --- | --- | --- | --- | --- |')
      for (const i of items) { const r = reasonFor(s.id, i) || {}; L.push(`| ${cell(i)} | ${cell(r.q || '**no reason: dropped**')} | ${cell(r.cause)} | ${cell(r.form)} | ${cell(r.then)} |`) }
      L.push('')
    }
    const seen = new Set()
    const fl = files.concat(s.data.some(d => d.includes('/lists/')) ? ['lists/'] : []).concat(s.data.some(d => d.includes('/impact/')) ? ['impact/'] : []).filter(f => !/^impact\/./.test(f))
    L.push('| File | Why it is there |', '| --- | --- |')
    for (const f of fl) { const r = reasonFor(s.id, f) || {}; const t = r.data || r.page || '**no reason recorded**'; if (seen.has(f)) continue; seen.add(f); L.push(`| \`${cell(f)}\` | ${cell(t)} |`) }
    if (s.dropped?.length) L.push('', `Dropped for lack of a reason: ${s.dropped.join(', ')}`)
    L.push('')
  }
  return L.join('\n')
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
        const D = opts.base ? itemDelta(L, C.json(path.join(opts.base, 'steps', S.id, 'data', 'lists', `${id}.json`))) : null
        if (D) { b.md += '\n' + deltaLine(D, L.noun || 'rows'); (r.changes ||= {})[id] = D }
        L.reason = reasonFor(S.id, id);
        (r.listMd ||= {})[id] = b.md
        if (b.svg) r.views[`${id}.svg`] = b.svg
        r.data[`lists/${id}.json`] = { title: L.title, columns: L.columns, sort: L.sort, rows: L.rows.map(x => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('_')))) }
      }
      r.pages['browse.html'] = html.browsePage(S, r.lists, C)
    }
    // every view, list and block appears under its question with its reason; without a reason it is dropped
    const dropped = []
    r.md = String(r.md || '').replace(/(?:### [^\n]*\n\n)?\{\{(view|list|block):([^}]+)\}\}/g, (m, kind, name) => {
      const why = reasonFor(S.id, name)
      const body = kind === 'view' ? (r.views?.[name] ? `![${why?.q || name}](views/${name})\n` : null) : kind === 'list' ? r.listMd?.[name] : r.blocks?.[name]
      if (body == null) return ''
      if (!why?.q || !why?.cause) { dropped.push(`${kind}:${name}`); if (kind === 'view') delete r.views[name]; return '' }
      return `### ${why.q}\n\n${reasonLine(why)}\n${body}`
    })
    const base = opts.base ? C.json(path.join(opts.base, 'steps', S.id, 'summary.json')) : null
    const kpis = delta(r.kpis || [], base)
    const summary = { blocks: Object.keys(r.blocks || {}), id: S.id, title: S.title, step: S.step, layer: S.layer, status: r.status, why: r.why || null, kpis, from: S.from, views: Object.keys(r.views || {}).map(v => `views/${v}`), pages: Object.keys(r.pages || {}), data: Object.keys(r.data || {}).map(d => `data/${d}`), lists: Object.fromEntries(Object.entries(r.lists || {}).map(([k, L]) => [k, L.rows.length])), dropped, changes: r.changes || null }
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
  write(path.join(dir, 'reasoning.md'), reasoningMd(list))
  if (opts.base) write(path.join(dir, 'changes.md'), changesMd(list, opts.base))
  write(path.join(dir, 'products.json'), list)
  write(path.join(dir, 'index.md'), html.hubMd(list, C))
  write(path.join(dir, 'index.html'), html.hubPage(list, C))
  const shown = list.filter(s => ['ok', 'warn', 'bad'].includes(s.status)).length
  return { list, said: `${list.length} step products → ${dir} (${shown} with results, ${list.filter(s => s.status === 'not-run').length} not run here, ${list.filter(s => s.status === 'failed').length} failed)` }
}

module.exports = { build, STEPS, ORDER }
