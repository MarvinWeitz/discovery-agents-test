// Adds runs to the GitHub Pages site and rewrites its index: node pages-index.js <site-dir> <result.json>...
// <site>/runs.json is the list of the latest run per app; index.md and index.html are rendered from it.
const fs = require('fs')
const path = require('path')
const [site, ...results] = process.argv.slice(2)
const file = path.join(site, 'runs.json')
let runs = []
try { runs = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
for (const f of results) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'))
  runs = runs.filter(x => x.slug !== r.slug).concat(r)
}
runs.sort((a, b) => a.slug.localeCompare(b.slug))
fs.writeFileSync(file, JSON.stringify(runs, null, 1))

const tests = r => r.tests ? `${r.tests.passed} pass · ${r.tests.failed} fail · ${r.tests.skipped} skip` : r.startup?.startsWith('failed') ? 'skipped: app did not start' : 'not run'
const kpi = (r, re) => (r.kpis || []).find(k => re.test(k.label))?.value ?? ''
const repoUrl = r => `https://github.com/${r.repo}`

const md = ['# Discovery runs', '',
  `${runs.length} app${runs.length === 1 ? '' : 's'}, latest run of each. Every atlas has a Markdown version (README.md and topics/) next to its HTML page.`, '',
  '| App | Repo | Run | Generated tests | Atlas |', '| --- | --- | --- | --- | --- |',
  ...runs.map(r => `| ${r.title} | [${r.repo}](${repoUrl(r)})${r.ref ? ` @ ${r.ref}` : ''} | [${r.date.slice(0, 10)}](${r.run_url}) · \`${String(r.commit).slice(0, 7)}\` | ${tests(r)} | [HTML](${r.slug}/) · [Markdown](${r.slug}/README.md) |`),
  '']
fs.writeFileSync(path.join(site, 'index.md'), md.join('\n'))

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const badge = r => {
  if (!r.tests) return `<span class="b mute">${esc(tests(r))}</span>`
  return `<span class="b ok">${r.tests.passed} pass</span>${r.tests.failed ? `<span class="b bad">${r.tests.failed} fail</span>` : ''}${r.tests.skipped ? `<span class="b mute">${r.tests.skipped} spec</span>` : ''}`
}
const rows = runs.map(r => `<tr>
  <td><a class="t" href="${esc(r.slug)}/">${esc(r.title)}</a>${r.curated ? '<span class="b ag" title="Agent findings from a reviewed deep dive are merged in">agent-reviewed</span>' : ''}<div class="s"><a href="${esc(repoUrl(r))}">${esc(r.repo)}</a>${r.ref ? ` @ ${esc(r.ref)}` : ''} · ${esc(r.app)}</div></td>
  <td class="n">${esc(kpi(r, /OData services|services/i))}</td>
  <td class="n">${esc(kpi(r, /entities/i))}</td>
  <td>${badge(r)}</td>
  <td><a href="${esc(r.run_url)}">${esc(r.date.slice(0, 10))}</a><div class="s"><code>${esc(String(r.commit).slice(0, 7))}</code></div></td>
  <td><a href="${esc(r.slug)}/">HTML</a> · <a href="${esc(r.slug)}/README.md">Markdown</a></td>
</tr>`).join('\n')

fs.writeFileSync(path.join(site, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Discovery Runs</title>
<style>
:root{--bg:#f7f7f5;--fg:#1d1d1b;--mute:#6b6b66;--line:#e2e1dc;--card:#fff;--acc:#0b6bcb;--ok:#1f7a3d;--okb:#e3f3e8;--bad:#b42318;--badb:#fde8e6;--ag:#6941c6;--agb:#efe9fb}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--mute:#9b9a94;--line:#2c2b28;--card:#1c1b19;--acc:#6aa9ec;--ok:#7bd396;--okb:#173222;--bad:#f7958b;--badb:#3a1a17;--ag:#b9a3f0;--agb:#2a2140}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px}h1{font-size:26px;margin:0 0 4px}p.l{color:var(--mute);margin:0 0 24px}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.w{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;min-width:640px}th,td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mute);font-weight:600}tr:last-child td{border-bottom:0}
.t{font-weight:600}.s{color:var(--mute);font-size:13px;margin-top:2px}.n{text-align:right;font-variant-numeric:tabular-nums}
.b{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;margin:0 4px 2px 0;white-space:nowrap}
.ok{background:var(--okb);color:var(--ok)}.bad{background:var(--badb);color:var(--bad)}.mute{background:var(--line);color:var(--mute)}.ag{background:var(--agb);color:var(--ag);margin-left:8px}
code{font-size:12px}
</style></head><body><main>
<h1>Discovery runs</h1>
<p class="l">${runs.length} app${runs.length === 1 ? '' : 's'}, latest run of each. Start a new one from the repo's Actions tab, workflow “Run discovery”. Same list as Markdown: <a href="index.md">index.md</a>.</p>
<div class="w"><table>
<thead><tr><th>App</th><th class="n">Services</th><th class="n">Entities</th><th>Generated tests</th><th>Run</th><th>Atlas</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
</main></body></html>
`)
console.log(`index: ${runs.length} runs`)
