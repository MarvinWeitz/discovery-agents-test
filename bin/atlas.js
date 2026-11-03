#!/usr/bin/env node
// Builds the atlas from one fact file: node bin/atlas.js <atlas-data.json> <out-dir>
// Writes three views of the same facts:
//   index.html          interactive page (template + data)
//   README.md, topics/  Markdown for people and AI agents, with tables and evidence
//   images/             PNG of every view, embedded in the Markdown
// Step 11 · Walkthrough: docs/walkthrough/11-atlas-and-addons.md
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const resolve = require('../lib/resolve') // packages also when hoisted (toolkit installed inside a project)
const { list, config } = require('../lib/addons')
const addons = list()
// "pages": sidebar, overview as home, one section per page; "single": everything on one long page.
// Readers can switch on the page; this sets the default.
const LAYOUT = process.env.DISCOVERY_ATLAS_LAYOUT || config().atlas?.layout || 'pages'
const PW = resolve.dir('playwright') || 'playwright'

// ---------- Markdown helpers ----------
const md = s => String(s ?? '').replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
const cell = s => md(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const evid = e => String(e).split(' · ').map(x => '`' + x + '`').join(', ')
const tone = x => { const m = String(x).match(/^(ac|jv|cr|wn|gd):(.*)$/); return m ? (m[1] === 'cr' ? `**${m[2]}** (finding)` : m[1] === 'wn' ? `${m[2]} (warning)` : m[2]) : x }
// Big apps: a Markdown table stops at MAX_ROWS ("first N of M"); every row stays in atlas-data.json
const MAX_ROWS = +process.env.DISCOVERY_MD_ROWS || 150
function table(head, rows, where = 'atlas-data.json') {
  const shown = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...shown.map(r => `| ${r.map(cell).join(' | ')} |`),
    ...(rows.length > MAX_ROWS ? ['', `_First ${MAX_ROWS} of ${rows.length} rows; all of them are in ${where} and on the page (index.html)._`] : [])].join('\n')
}
// any Markdown table an addon writes gets the same cap (the generators above already cap their own)
function capTables(text) {
  const L = String(text).split('\n'), out = []
  for (let i = 0; i < L.length;) {
    if (!L[i].startsWith('|')) { out.push(L[i++]); continue }
    let j = i; while (j < L.length && L[j].startsWith('|')) j++
    const rows = j - i - 2
    out.push(...L.slice(i, Math.min(j, i + 2 + MAX_ROWS)))
    if (rows > MAX_ROWS) out.push('', `_First ${MAX_ROWS} of ${rows} rows; all of them are in atlas-data.json and on the page (index.html)._`)
    i = j
  }
  return out.join('\n')
}
let SHOTS = null // set after rendering; null = images were not attempted (keep the links as before)
const img = (code, k, label) => !SHOTS || SHOTS.has(`${code}-${k}`) ? `![${code}-${k} ${label}](../images/${code}-${k}.png)` : `_No image for ${code}-${k} ${label} in this run; open [index.html](../index.html) for the interactive view._`

// ---------- one generator per topic; each returns the Markdown body ----------
const TOPICS = {
  ARC: D => table(['Layer', 'Path', 'Contents', 'Findings'], D.ARC_LAYERS.map(([n, p, s, f]) => [n, p, s.map(tone).join(', '), f.map(tone).join(', ') || 'none'])),
  DAT: D => [
    '### Entities', '', table(['Entity', 'Kind', 'Draft', 'Exposed in', '@restrict', 'PII', 'Node hooks'],
      D.DAT_ROWS.map(r => [r[0], { tx: 'transactional', md: 'master data', cl: 'code list' }[r[1]], yn(r[2]), r[3], yn(r[4]), yn(r[5]), r[6]])),
    '', '### Relations', '', table(['From', 'Kind', 'To', 'Via element'], D.REL.map(([f, t, k, l]) => [f, k === 'comp' ? 'composition' : 'association', t, l]))
  ].join('\n'),
  DEP: D => {
    const name = Object.fromEntries(D.FILES.map(f => [f[0], f[1]]))
    return ['### Files', '', table(['Id', 'File', 'Layer'], D.FILES.map(f => [f[0], f[1], f[2]])), '',
      '### Uses', '', table(['From', 'To', 'Verdict', 'Why', 'Evidence'], D.DEPS.map(([f, t, k, l, e]) => [name[f], name[t], { ok: 'allowed', bad: 'VIOLATION', skip: 'skips the service layer' }[k], l || '', e ? '`' + e + '`' : '']))].join('\n')
  },
  FLW: D => ['### Recompute flow', '', table(['From', 'To', 'Weight'], D.SANKEY_LINKS.map(([s, t, v]) => [D.SANKEY_NODES[s], D.SANKEY_NODES[t], v])), '',
    ...(D.SWIM ? [`### Swimlane: ${D.SWIM.title} (\`${D.SWIM.ev}\`)`, '', table(['#', 'From', 'To', 'Step', 'Evidence'], D.SWIM.steps.map((x, i) => [i + 1, D.SWIM.lanes[x.a], D.SWIM.lanes[x.b], x.t, x.sub ? '`' + x.sub + '`' : ''])), ''] : []),
    '### Hooks per lifecycle event', '', table(['Event', 'Node server', 'Fiori UI'], D.HOOK_EVENTS.map((e, i) => [e, hooks(D.HOOK_NODE[i]), hooks(D.HOOK_UI[i])])),
    '', 'A hook marked **(one side only)** is a rule without a counterpart on the other side, or a defect.'].join('\n'),
  STA: D => [`States of \`${D.STATES.entity}.${D.STATES.field}\`: ${D.STATES.codes.map(c => `${c}${D.STATES.names[c] ? ' (' + D.STATES.names[c] + ')' : ''}`).join(', ')}${D.STATES.default ? `; default ${D.STATES.default}` : ''}.`, '',
    ...(D.STATES.others?.length ? [`Other fields that decide which actions the UI offers (scored lower: fewer states, a flag, or a path): ${D.STATES.others.slice(0, 12).map(o => `\`${o.entity}.${o.field}\` (${o.actions.join(', ')})`).join('; ')}${D.STATES.others.length > 12 ? `; and ${D.STATES.others.length - 12} more` : ''}.`, ''] : []),
    table(['Action', 'From', 'To', 'UI offers it', 'Node allows it', 'Verdict', 'Evidence'], D.TR.map(t => [t.a, t.f, t.t, yn(t.ui ? 'y' : 'n'), yn(t.node ? 'y' : 'n'),
    t.ui === t.node ? 'consistent' : t.node ? 'reachable only via OData (UI hides it)' : 'UI offers it, server refuses', (t.ev || []).slice(0, 2).map(e => '`' + e + '`').join(', ')]))].join('\n'),
  AUT: D => {
    const L = { y: 'allowed', n: 'denied', r: 'OPEN', a: 'unclear' }
    return [table(['Operation', ...D.ROLES.map(r => r[1]), 'Evidence', 'Note'], D.AUTH.map(a => [a.op, ...a.c.map(c => { const o = typeof c === 'string' ? { v: c } : c; return L[o.v] + (o.t ? ' (tested)' : '') }), '`' + a.ev + '`', a.note || ''])),
      '', 'OPEN = readable without the role you would expect. "(tested)" = an existing test exercises the cell.'].join('\n')
  },
  PAT: D => table(['Pattern', 'Where', 'Uses', 'Health', 'Note', 'Layers', 'Evidence'], D.PATTERNS.map(p => [p.n, p.w, p.k, { gd: 'idiomatic', wn: 'works, enforced in the wrong place', cr: 'causes a defect or exposure' }[p.h], p.x || '', p.L.map(l => (D.LAYERS.find(x => x[0] === l) || [l, l])[1]).join(', '), '`' + p.ev + '`'])),
  // confirmations (the server or CAP keeps the promise) are counted; the table lists what needs a decision
  UIS: D => {
    const ok = new Set(['enforced', 'consistent', 'framework']), todo = D.PARITY.filter(p => !ok.has(p[3])), fine = D.PARITY.length - todo.length
    return ['Verdicts: ' + Object.entries(D.PV).map(([k, v]) => `${v[2]} (${D.PARITY.filter(p => p[3] === k).length})`).join(', ') + '.', '',
      ...(fine ? [`${fine} promise${fine === 1 ? ' is' : 's are'} kept by the server or by CAP and not listed here (all in atlas-data.json, PARITY).`, ''] : []),
      todo.length ? table(['Rule', 'UI promises', 'Node server', 'Verdict', 'Evidence'], todo.map(([b, u, n, v, e]) => [b, u, n, D.PV[v]?.[2] ?? v, evid(e)]), 'atlas-data.json (PARITY)') : '_Every UI promise is kept._'].join('\n')
  },
  RSK: D => {
    const R = [...D.RISKS].sort((a, b) => b.i * b.l - a.i * a.l)
    return [table(['Id', 'Risk', 'Layer', 'Impact', 'Likelihood', 'Score', 'Found by', 'Evidence'], R.map(r => [r.id, r.t, r.lay, r.i, r.l, r.i * r.l, r.src === 'agent' ? 'agent review' : 'rule ' + r.key, '`' + r.ev + '`'])), '',
      ...R.slice(0, 60).flatMap(r => [`#### ${r.id} ${r.t}`, '', r.d, '', `- Evidence: \`${r.ev}\`${r.count > 1 ? ` (and ${r.count - 1} more places of the same kind)` : ''}`, `- Test that catches it: ${r.test}`, '']),
      ...(R.length > 60 ? [`_Details for the first 60 of ${R.length} risks; all of them are in atlas-data.json (RISKS)._`, ''] : [])].join('\n')
  },
  TST: (D, extra) => [table(['Category', 'Technique', 'Classes', 'Covered today', 'How the classes were cut'], [...D.TESTCATS].sort((a, b) => b.cls - a.cls).map(c => [c.n, c.k, c.cls, c.cov, c.why])), '',
    `Total: ${D.TESTCATS.reduce((a, c) => a + c.cls, 0)} classes, ${D.TESTCATS.reduce((a, c) => a + c.cov, 0)} covered.`, '',
    ...(D.DD ? [`### ${D.DD.action} classification tree`, '', table(['Factor', 'Classes', 'Invalid', 'Boundary'], D.DD.factors.map(([n, v]) => [n, v.join(', '), (D.DD.invalid[n] || []).join(', '), (D.DD.boundary[n] || []).join(', ')])), '',
    `Full combination: ${D.DD.full} cases. All-pairs suite (${D.DD.rows.length} cases, seeded, identical every run):`, '',
    extra.pairwise ? table(extra.pairwise[0], extra.pairwise.slice(1)) : '_not rendered_', ''] : []),
    '### All equivalence classes', '', table(['Category', 'Id', 'Class', 'Input', 'Expected', 'Today', 'Covered by', 'Request generated'], D.CLASSES || [])].join('\n'),
  API: D => table(['Endpoint', 'Methods', 'Access', 'Note'], D.API.flatMap(s => [...s.sets.map(([n, m, a, t]) => [s.root + '/' + n, m, a, t]), ...s.acts.map(([n, r, x, e]) => [e ? `${s.root}/${e}(…)/${n}` : `${s.root}/${n}`, 'POST', r, x || 'bound action'])]))
}
function yn(v) { return { y: 'yes', n: 'no', a: 'unclear (verify)', r: 'EXPOSED' }[v] ?? v }
function hooks(hs) { return (hs || []).map(([t, e, bad]) => `${t} \`${e}\`${bad ? ' **(one side only)**' : ''}`).join('<br>') || '-' }

// ---------- HTML ----------
// The page embeds a lighter copy of the facts (a real app made a 25 MB page that browsers and the screenshot
// step choked on): long lists are cut to what a person pages through, the cut is noted in CUT so the views can
// say "first N of M", and lists only Markdown or files use stay out. atlas-data.json keeps everything.
const PAGE_MAX = { CLASSES: 600, PARITY: 800, NEXT: 400, COVERAGE: 1500, HEAT: 300, AUTH: 2500, UITESTS: 150 }
function pageData(D) {
  const P = { ...D }, CUT = {}
  const cut = (key, list, n) => { if (!Array.isArray(list) || list.length <= n) return list; CUT[key] = [n, list.length]; return list.slice(0, n) }
  if (D.CLASSES) P.CLASSES = cut('CLASSES', D.CLASSES, PAGE_MAX.CLASSES)
  if (D.PARITY) {
    P.PARITY_COUNTS = D.PARITY.reduce((a, p) => (a[p[3]] = (a[p[3]] || 0) + 1, a), {})
    const kept = new Set(['enforced', 'consistent', 'framework'])
    P.PARITY = cut('PARITY', [...D.PARITY.filter(p => !kept.has(p[3])), ...D.PARITY.filter(p => kept.has(p[3]))], PAGE_MAX.PARITY)
  }
  if (D.AUTH) P.AUTH = cut('AUTH', D.AUTH, PAGE_MAX.AUTH)
  if (D.NEXT?.items) P.NEXT = { ...D.NEXT, items: cut('NEXT', D.NEXT.items, PAGE_MAX.NEXT) }
  if (D.DOCS?.sentences) P.DOCS = { ...D.DOCS, sentences: [] } // the docs/ folder holds them; no view reads them
  if (D.UITESTS?.skipped) P.UITESTS = { ...D.UITESTS, skipped: cut('UITESTS', D.UITESTS.skipped, PAGE_MAX.UITESTS) }
  if (D.COVERAGE?.classes) {
    const C = D.COVERAGE, rank = { fail: 0, none: 1, likely: 2, spec: 3, gen: 4, tested: 5 }
    let heat = C.heat
    if (heat?.rows?.length > PAGE_MAX.HEAT) { CUT.HEAT = [PAGE_MAX.HEAT, heat.rows.length]; heat = { ...heat, rows: heat.rows.slice(0, PAGE_MAX.HEAT), cells: heat.cells.slice(0, PAGE_MAX.HEAT) } }
    const need = new Set([...(heat?.cells || []).flat(2), ...(C.next || []).map(n => n.id)])
    const classes = C.classes.length <= PAGE_MAX.COVERAGE ? C.classes : C.classes.filter(c => need.has(c.id)).concat(C.classes.filter(c => !need.has(c.id)).sort((a, b) => (rank[a.st] ?? 9) - (rank[b.st] ?? 9))).slice(0, Math.max(PAGE_MAX.COVERAGE, need.size))
    if (classes.length < C.classes.length) CUT.COVERAGE = [classes.length, C.classes.length]
    P.COVERAGE = { ...C, heat, classes }
  }
  P.CUT = CUT
  return P
}
function buildHtml(D) {
  const t = fs.readFileSync(path.join(ROOT, 'atlas', 'template.html'), 'utf8')
  const m = D.META
  return t.replace(/\{\{TITLE\}\}/g, m.title).replace('{{EYEBROW}}', `Discovery run · ${m.app} · ${m.license} · ${m.scope} · ${m.run}`)
    .replace('{{LEDE}}', m.lede).replace('{{LAYOUT}}', LAYOUT === 'single' ? 'single' : 'pages').replace('{{URL}}', m.url).replace('{{APP}}', m.app.replace(/^/, 'github.com/'))
    .replace('/*ADDON_VIEWS*/', () => addons.filter(a => a.views).map(a => fs.readFileSync(a.views, 'utf8')).join('\n'))
    .replace('/*ATLAS_DATA*/null', () => JSON.stringify(pageData(D)).replace(/</g, '\\u003c'))
}

// ---------- images: one PNG per view, plus extras the Markdown needs ----------
async function render(html, outDir, D) {
  // Without Playwright + Chromium (e.g. a laptop that never installed them) the Markdown and index.html are
  // still written; only the PNG renderings are missing. DISCOVERY_IMAGES=off skips them on purpose.
  let chromium, b
  try {
    if (process.env.DISCOVERY_IMAGES === 'off') throw new Error('DISCOVERY_IMAGES=off')
    ;({ chromium } = require(PW))
    b = await chromium.launch()
  } catch (e) {
    console.warn(`images skipped (${String(e.message).split('\n')[0]}); install Playwright + Chromium for the PNGs`)
    return { extra: {}, shots: [], errors: [] }
  }
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' })
  const errors = []
  p.on('pageerror', e => errors.push(e.message))
  await p.route('**/d3.min.js', r => r.fulfill({ path: path.join(resolve.dir('d3'), 'dist/d3.min.js'), contentType: 'text/javascript' }))
  await p.route('**/d3-sankey.min.js', r => r.fulfill({ path: path.join(resolve.dir('d3-sankey'), 'dist/d3-sankey.min.js'), contentType: 'text/javascript' }))
  await p.route('https://fonts.**', r => r.abort())
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, { waitUntil: 'load' })
  await p.evaluate(() => { document.documentElement.dataset.layout = 'single' })
  await p.addStyleTag({ content: '.topbar,.tray{display:none!important} nav.codes{position:static!important}' })
  const extra = {}, shots = []
  const t0 = Date.now(), BUDGET = (+process.env.DISCOVERY_IMAGE_MINUTES || 8) * 60000
  let misses = 0 // after 3 failed captures the page is likely stuck: stop trying instead of waiting a minute per view
  for (const s of D.SECTIONS) {
    if (misses >= 3) { errors.push(`${s.code}: images skipped after ${misses} failed captures`); continue }
    // big apps: huge views take long to capture; after the budget the remaining sections get no PNGs
    if (Date.now() - t0 > BUDGET) { errors.push(`${s.code}: images skipped, time budget of ${BUDGET / 60000} min used (DISCOVERY_IMAGE_MINUTES)`); continue }
    const sec = await p.$('#' + s.code.toLowerCase())
    if (!sec) continue
    for (const v of s.views) {
      // one view that cannot be captured (a very large force graph never settles) loses its PNG; the rest go on
      try {
        await (await sec.$(`[data-v="${v.k}"]`)).click()
        await p.waitForTimeout(v.label.includes('Force') ? 2500 : 400)
        const view = await sec.$('.view')
        // an empty view (tiny app, nothing to draw) has no box: skip its image instead of failing the atlas
        if (!(await view.boundingBox())?.height) { errors.push(`${s.code}-${v.k}: empty view, no image`); continue }
        await view.screenshot({ path: path.join(outDir, 'images', `${s.code}-${v.k}.png`), animations: 'disabled', timeout: 30000 })
        shots.push(`${s.code}-${v.k}`)
        if (s.code === 'STA' && v.k === 'A' && D.STATES) {
          await (await sec.$('[data-l="node"]')).click(); await p.waitForTimeout(200)
          await view.screenshot({ path: path.join(outDir, 'images', 'STA-A-node.png'), animations: 'disabled', timeout: 30000 }); shots.push('STA-A-node')
          await (await sec.$('[data-l="ui"]')).click()
        }
        if (s.code === 'TST' && v.k === 'B') extra.pairwise = await sec.$$eval('#pwt tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim())))
      } catch (e) {
        misses++
        errors.push(`${s.code}-${v.k}: no image (${String(e.message).split('\n')[0]})`)
        console.error(`::warning::atlas image ${s.code}-${v.k} skipped: ${String(e.message).split('\n')[0]}`)
      }
    }
  }
  await b.close()
  return { extra, shots, errors }
}

// Numbers in KPIs and takeaways are written by people or agents; recount them from the facts
function check(D) {
  const kpi = l => (D.KPIS.find(k => k[1] === l) || [])[0]
  const want = [
    ['risks with evidence', String(D.RISKS.length)],
    ['equivalence classes', String(D.TESTCATS.reduce((a, c) => a + c.cls, 0))],
    ['covered today', String(D.TESTCATS.reduce((a, c) => a + c.cov, 0))],
    ['coding patterns', String(D.PATTERNS.length)],
    ['UI rules the server skips', `${D.PARITY.filter(p => p[3] === 'ui-only').length} / ${D.PARITY.length}`]]
  return want.filter(([l, v]) => kpi(l) !== undefined && kpi(l) !== v).map(([l, v]) => `KPI "${l}" says ${kpi(l)}, facts say ${v}`)
}

// one topic whose Markdown generator crashes on unexpected data gets a note instead of failing the atlas
function topicText(code, D, extra) {
  const gen = TOPICS[code] || addons.find(a => a.topics?.[code])?.topics[code] || (() => '_No Markdown generator for this topic._')
  try { return gen(D, extra) } catch (e) {
    console.error(`::warning::atlas topic ${code} Markdown failed: ${e?.stack || e}`)
    return `_The Markdown table for this topic could not be written in this run (${String(e?.message || e).split('\n')[0]}). The facts are in atlas-data.json and index.html._`
  }
}

async function main() {
  const [dataFile, outDir] = process.argv.slice(2)
  if (!dataFile || !outDir) { console.error('usage: atlas.js <atlas-data.json> <out-dir>'); process.exit(2) }
  const D = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  for (const a of addons) if (a.prepare) a.prepare(D)
  const problems = check(D)
  for (const p of problems) console.warn('check: ' + p)
  for (const d of ['images', 'topics']) fs.mkdirSync(path.join(outDir, d), { recursive: true })
  const html = buildHtml(D)
  fs.writeFileSync(path.join(outDir, 'index.html'), html)
  fs.writeFileSync(path.join(outDir, 'atlas-data.json'), JSON.stringify(D, null, 1))
  const { extra, shots, errors } = await render(html, outDir, D)
  if (shots.length) SHOTS = new Set(shots)

  const m = D.META, files = []
  D.SECTIONS.forEach((s, i) => {
    const file = `${String(i + 1).padStart(2, '0')}-${s.code.toLowerCase()}-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}.md`
    files.push([s, file])
    const views = s.views.flatMap(v => [`**${s.code}-${v.k} ${v.label}**`, '', img(s.code, v.k, v.label), '', ...(s.code === 'STA' && v.k === 'A' ? ['Same machine, Node layer (red = differs from the UI):', '', `![STA-A Node layer](../images/STA-A-node.png)`, ''] : [])])
    const out = ['---', `app: ${m.app}`, `scope: ${m.scope}`, `run: ${m.run}`, `topic: ${s.code}`, `title: ${s.name}`, `views: [${s.views.map(v => s.code + '-' + v.k).join(', ')}]`, 'source: atlas-data.json', `facts: ${(m.sources || {})[s.code] || 'curated'}`, '---', '',
      `# ${s.code} · ${s.name}`, '', `> ${md(s.take)}`, '', '## Facts', '', `_Facts ${({ generated: 'generated from the knowledge graph', 'generated + agent': 'generated from the knowledge graph, plus agent findings (marked "agent review")' })[(m.sources || {})[s.code]] || ((m.sources || {})[s.code] ? (m.sources || {})[s.code] : 'curated from the deep read (not yet generated)')}._`, '', capTables(topicText(s.code, D, extra)), '', ...addons.map(a => a.topicAppend?.(s.code, D)).filter(Boolean).flatMap(t => [capTables(t), '']), '## Views', '', ...views,
      `[Back to the index](../README.md)`, '']
    fs.writeFileSync(path.join(outDir, 'topics', file), out.join('\n'))
  })
  const readme = ['---', `app: ${m.app}`, `source_url: ${m.url}`, `license: ${m.license}`, `scope: ${m.scope}`, `run: ${m.run}`, 'generator: cap-discovery-toolkit bin/atlas.js', 'facts: atlas-data.json', '---', '',
    `# ${m.title}`, '', m.lede, '', table(['Measure', 'Value'], D.KPIS.map(([v, l]) => [l, v])), '',
    '## Topics', '', table(['Code', 'Topic', 'Takeaway', 'File'], files.map(([s, f]) => [s.code, s.name, s.take, `[${f}](topics/${f})`])), '',
    '## How to read this', '',
    '- Evidence is `file:line` in the analysed repository; every risk and rule carries at least one.',
    '- "verify" marks a fact inferred from annotations that still needs a request against a running app.',
    '- Ids are stable between runs of the same commit: G1… rule risks, A1… agent risks, ARC-A… views, UIS:… / AUT:… test classes.',
    '- The same facts drive three outputs: these Markdown files, the PNGs in `images/`, and the interactive `index.html`.', '',
    '## For AI agents', '',
    '- Read this file first, then only the topic files you need; each starts with YAML front matter.',
    '- Tables are the authoritative content. Images are renderings of the same tables and add no facts.',
    ...(D.NEXT ? ['- Start with the NXT topic file for what to do next: ranked steps, each with a prompt block (evidence, what to do, when it is done).'] : []),
    '- `atlas-data.json` holds every fact in machine-readable form (keys: ' + Object.keys(D).join(', ') + ').', '']
  fs.writeFileSync(path.join(outDir, 'README.md'), readme.join('\n'))
  console.log(`atlas written to ${outDir}: ${files.length} topics, ${shots.length} images${errors.length ? ', page errors: ' + errors.join('; ') : ''}`)
}

main().catch(e => { console.error(e); process.exit(1) })
