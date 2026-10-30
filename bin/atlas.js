#!/usr/bin/env node
// Builds the atlas from one fact file: node bin/atlas.js <atlas-data.json> <out-dir>
// Writes three views of the same facts:
//   index.html          interactive page (template + data)
//   README.md, topics/  Markdown for people and AI agents, with tables and evidence
//   images/             PNG of every view, embedded in the Markdown
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const NM = path.join(ROOT, 'node_modules')
const { list, config } = require('../lib/addons')
const addons = list()
// "pages": sidebar, overview as home, one section per page; "single": everything on one long page.
// Readers can switch on the page; this sets the default.
const LAYOUT = process.env.DISCOVERY_ATLAS_LAYOUT || config().atlas?.layout || 'pages'
const PW = fs.existsSync(path.join(NM, 'playwright')) ? path.join(NM, 'playwright') : '/opt/node-tools/node_modules/playwright'

// ---------- Markdown helpers ----------
const md = s => String(s ?? '').replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
const cell = s => md(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const evid = e => String(e).split(' · ').map(x => '`' + x + '`').join(', ')
const tone = x => { const m = String(x).match(/^(ac|jv|cr|wn|gd):(.*)$/); return m ? (m[1] === 'cr' ? `**${m[2]}** (finding)` : m[1] === 'wn' ? `${m[2]} (warning)` : m[2]) : x }
function table(head, rows) {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n')
}
const img = (code, k, label) => `![${code}-${k} ${label}](../images/${code}-${k}.png)`

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
    table(['Action', 'From', 'To', 'UI offers it', 'Node allows it', 'Verdict', 'Evidence'], D.TR.map(t => [t.a, t.f, t.t, yn(t.ui ? 'y' : 'n'), yn(t.node ? 'y' : 'n'),
    t.ui === t.node ? 'consistent' : t.node ? 'reachable only via OData (UI hides it)' : 'UI offers it, server refuses', (t.ev || []).slice(0, 2).map(e => '`' + e + '`').join(', ')]))].join('\n'),
  AUT: D => {
    const L = { y: 'allowed', n: 'denied', r: 'OPEN', a: 'unclear' }
    return [table(['Operation', ...D.ROLES.map(r => r[1]), 'Evidence', 'Note'], D.AUTH.map(a => [a.op, ...a.c.map(c => { const o = typeof c === 'string' ? { v: c } : c; return L[o.v] + (o.t ? ' (tested)' : '') }), '`' + a.ev + '`', a.note || ''])),
      '', 'OPEN = readable without the role you would expect. "(tested)" = an existing test exercises the cell.'].join('\n')
  },
  PAT: D => table(['Pattern', 'Where', 'Uses', 'Health', 'Note', 'Layers', 'Evidence'], D.PATTERNS.map(p => [p.n, p.w, p.k, { gd: 'idiomatic', wn: 'works, enforced in the wrong place', cr: 'causes a defect or exposure' }[p.h], p.x || '', p.L.map(l => (D.LAYERS.find(x => x[0] === l) || [l, l])[1]).join(', '), '`' + p.ev + '`'])),
  UIS: D => [table(['Rule', 'UI promises', 'Node server', 'Verdict', 'Evidence'], D.PARITY.map(([b, u, n, v, e]) => [b, u, n, D.PV[v][2], evid(e)])), '',
    'Verdicts: ' + Object.entries(D.PV).map(([k, v]) => `${v[2]} (${D.PARITY.filter(p => p[3] === k).length})`).join(', ') + '.'].join('\n'),
  RSK: D => {
    const R = [...D.RISKS].sort((a, b) => b.i * b.l - a.i * a.l)
    return [table(['Id', 'Risk', 'Layer', 'Impact', 'Likelihood', 'Score', 'Found by', 'Evidence'], R.map(r => [r.id, r.t, r.lay, r.i, r.l, r.i * r.l, r.src === 'agent' ? 'agent review' : 'rule ' + r.key, '`' + r.ev + '`'])), '',
      ...R.flatMap(r => [`#### ${r.id} ${r.t}`, '', r.d, '', `- Evidence: \`${r.ev}\``, `- Test that catches it: ${r.test}`, ''])].join('\n')
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
function buildHtml(D) {
  const t = fs.readFileSync(path.join(ROOT, 'atlas', 'template.html'), 'utf8')
  const m = D.META
  return t.replace(/\{\{TITLE\}\}/g, m.title).replace('{{EYEBROW}}', `Discovery run · ${m.app} · ${m.license} · ${m.scope} · ${m.run}`)
    .replace('{{LEDE}}', m.lede).replace('{{LAYOUT}}', LAYOUT === 'single' ? 'single' : 'pages').replace('{{URL}}', m.url).replace('{{APP}}', m.app.replace(/^/, 'github.com/'))
    .replace('/*ADDON_VIEWS*/', () => addons.filter(a => a.views).map(a => fs.readFileSync(a.views, 'utf8')).join('\n'))
    .replace('/*ATLAS_DATA*/null', () => JSON.stringify(D).replace(/</g, '\\u003c'))
}

// ---------- images: one PNG per view, plus extras the Markdown needs ----------
async function render(html, outDir, D) {
  const { chromium } = require(PW)
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' })
  const errors = []
  p.on('pageerror', e => errors.push(e.message))
  await p.route('**/d3.min.js', r => r.fulfill({ path: path.join(NM, 'd3/dist/d3.min.js'), contentType: 'text/javascript' }))
  await p.route('**/d3-sankey.min.js', r => r.fulfill({ path: path.join(NM, 'd3-sankey/dist/d3-sankey.min.js'), contentType: 'text/javascript' }))
  await p.route('https://fonts.**', r => r.abort())
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, { waitUntil: 'load' })
  await p.evaluate(() => { document.documentElement.dataset.layout = 'single' })
  await p.addStyleTag({ content: '.topbar,.tray{display:none!important} nav.codes{position:static!important}' })
  const extra = {}, shots = []
  for (const s of D.SECTIONS) {
    const sec = await p.$('#' + s.code.toLowerCase())
    for (const v of s.views) {
      await (await sec.$(`[data-v="${v.k}"]`)).click()
      await p.waitForTimeout(v.label.includes('Force') ? 2500 : 400)
      const view = await sec.$('.view')
      await view.screenshot({ path: path.join(outDir, 'images', `${s.code}-${v.k}.png`) })
      shots.push(`${s.code}-${v.k}`)
      if (s.code === 'STA' && v.k === 'A' && D.STATES) {
        await (await sec.$('[data-l="node"]')).click(); await p.waitForTimeout(200)
        await view.screenshot({ path: path.join(outDir, 'images', 'STA-A-node.png') }); shots.push('STA-A-node')
        await (await sec.$('[data-l="ui"]')).click()
      }
      if (s.code === 'TST' && v.k === 'B') extra.pairwise = await sec.$$eval('#pwt tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim())))
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

  const m = D.META, files = []
  D.SECTIONS.forEach((s, i) => {
    const file = `${String(i + 1).padStart(2, '0')}-${s.code.toLowerCase()}-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}.md`
    files.push([s, file])
    const views = s.views.flatMap(v => [`**${s.code}-${v.k} ${v.label}**`, '', img(s.code, v.k, v.label), '', ...(s.code === 'STA' && v.k === 'A' ? ['Same machine, Node layer (red = differs from the UI):', '', `![STA-A Node layer](../images/STA-A-node.png)`, ''] : [])])
    const out = ['---', `app: ${m.app}`, `scope: ${m.scope}`, `run: ${m.run}`, `topic: ${s.code}`, `title: ${s.name}`, `views: [${s.views.map(v => s.code + '-' + v.k).join(', ')}]`, 'source: atlas-data.json', `facts: ${(m.sources || {})[s.code] || 'curated'}`, '---', '',
      `# ${s.code} · ${s.name}`, '', `> ${md(s.take)}`, '', '## Facts', '', `_Facts ${({ generated: 'generated from the knowledge graph', 'generated + agent': 'generated from the knowledge graph, plus agent findings (marked "agent review")' })[(m.sources || {})[s.code]] || ((m.sources || {})[s.code] ? (m.sources || {})[s.code] : 'curated from the deep read (not yet generated)')}._`, '', (TOPICS[s.code] || addons.find(a => a.topics?.[s.code])?.topics[s.code] || (() => '_No Markdown generator for this topic._'))(D, extra), '', ...addons.map(a => a.topicAppend?.(s.code, D)).filter(Boolean).flatMap(t => [t, '']), '## Views', '', ...views,
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
