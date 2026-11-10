// HTML for the step products: the start page (tiles of every product) and one page per product that
// renders its README.md card (marked, MIT) with its views. Static files, no build step; Mermaid blocks
// are drawn by mermaid from a CDN. Works from GitHub Pages, an artifact store or a local folder.
const { marked } = require('marked')
const { table } = require('./md')

const LAYERS = { run: 'Run', model: 'Model', service: 'Service', code: 'Code', ui: 'UI', access: 'Access', tests: 'Tests' }
const GROUPS = [['How the run went', ['run', 'project', 'findings', 'ai']], ['What the app is', ['model', 'api', 'behaviour', 'screens', 'access']], ['Where it is fragile', ['checks', 'history']], ['How well it is tested', ['testdesign', 'tests', 'coverage', 'mutation']]]
const STATUS = { ok: 'results', warn: 'needs a look', bad: 'problems', 'not-run': 'not run here', empty: 'nothing found', failed: 'failed' }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const CSS = `
:root{--bg:#f6f8fa;--panel:#fff;--ink:#1f2328;--mute:#59636e;--line:#d1d9e0;--soft:#eef2f5;--accent:#0f6c8c;
--ok:#2f8a3a;--warn:#b26a00;--bad:#c2414b;--none:#8c959f;
--l-run:#5b6875;--l-model:#4f5bd5;--l-service:#138a7e;--l-code:#b26a00;--l-ui:#8a4fc4;--l-access:#c2414b;--l-tests:#2f8a3a}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--panel:#161b22;--ink:#e6edf3;--mute:#9198a1;--line:#30363d;--soft:#1c232c;--accent:#4fb3d4;
--ok:#6cc777;--warn:#e3a03c;--bad:#ec7880;--l-run:#9198a1;--l-model:#8d96f2;--l-service:#46c2b4;--l-code:#e3a03c;--l-ui:#bb8ced;--l-access:#ec7880;--l-tests:#6cc777;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}code,pre{font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.top{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;padding:14px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line);background:var(--panel)}
.top b{font-size:16px}.top span{color:var(--mute);font-size:13px}
.layout{display:grid;grid-template-columns:240px minmax(0,1fr);max-width:1280px;margin:0 auto}
nav{border-right:1px solid var(--line);padding:14px 12px;position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;font-size:14px}
nav h4{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:14px 6px 4px}
nav a{display:flex;gap:8px;align-items:center;padding:4px 6px;border-radius:6px;color:var(--ink);text-decoration:none}
nav a:hover{background:var(--soft)}nav a.on{background:var(--soft);font-weight:600}
.dot{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block}
.st-ok{background:var(--ok)}.st-warn{background:var(--warn)}.st-bad{background:var(--bad)}.st-not-run,.st-empty{background:transparent;border:1.5px solid var(--none)}.st-failed{background:var(--bad)}
main{padding:20px max(16px,env(safe-area-inset-right,0px)) 60px 28px;min-width:0}
main h1{font-size:26px;margin:4px 0 6px}main h2{font-size:19px;margin:26px 0 8px}main h3{font-size:16px;margin:22px 0 8px}
main img{max-width:100%;height:auto;display:block;margin:8px 0;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px}
main table{border-collapse:collapse;display:block;overflow-x:auto;font-size:13.5px;margin:8px 0}
main th,main td{border-bottom:1px solid var(--line);padding:5px 10px;text-align:left;vertical-align:top}
main th{font-size:12px;color:var(--mute)}main blockquote{margin:10px 0;padding:8px 12px;border-left:3px solid var(--warn);background:var(--soft);border-radius:0 6px 6px 0}
main pre{background:var(--soft);padding:10px;border-radius:8px;overflow-x:auto}pre.mermaid{background:var(--panel);border:1px solid var(--line)}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;margin:10px 0 8px}
.tile{display:grid;gap:8px;align-content:start;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;color:var(--ink);text-decoration:none;border-top:3px solid var(--lc)}
.tile:hover{border-color:var(--accent);border-top-color:var(--lc)}
.tile .h{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.tile .h b{font-size:15.5px}
.tile small{color:var(--mute);font-size:12px}
.pill{font-size:11.5px;border-radius:99px;padding:1px 8px;white-space:nowrap;border:1px solid var(--line);color:var(--mute)}
.pill.ok{color:var(--ok);border-color:currentColor}.pill.warn{color:var(--warn);border-color:currentColor}.pill.bad,.pill.failed{color:var(--bad);border-color:currentColor}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}.kpis div{font-size:12px;color:var(--mute);line-height:1.3}
.kpis b{display:block;font-size:18px;color:var(--ink);font-variant-numeric:tabular-nums}.kpis b.bad{color:var(--bad)}.kpis b.warn{color:var(--warn)}.kpis b.ok{color:var(--ok)}
.kpis i{font-style:normal;font-size:11px;margin-left:4px}
.thumb{height:90px;overflow:hidden;border-radius:6px;background:var(--soft);display:flex;align-items:flex-start;justify-content:flex-start}
.thumb img{max-width:none;width:100%;height:auto;border:0;padding:4px;margin:0;background:transparent}
.why{font-size:12.5px;color:var(--mute)}
.lede{color:var(--mute);max-width:72ch}
@media (max-width:820px){.layout{grid-template-columns:1fr}nav{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px}nav h4{width:100%}main{padding-left:max(16px,env(safe-area-inset-left,0px))}}
`

function head(title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title><style>${CSS}</style></head><body>`
}
function top(C) {
  const M = C.manifest() || {}
  return `<div class="top"><b>${esc(C.facts().META?.title?.replace(/ Discovery Atlas$/, '') || M.app?.name || 'Discovery')}</b><span>${esc(M.app?.name || '')} ${M.app?.commit ? '@ ' + M.app.commit.slice(0, 7) : ''}</span><span>mode ${esc(M.mode || 'static')}</span><span>${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</span><span><a href="${C.exists(C.P('atlas', 'index.html')) ? '../atlas/index.html' : '#'}">atlas</a></span></div>`
}
function nav(list, cur, rel) {
  let h = `<nav aria-label="Products"><a href="${rel}index.html" class="${cur ? '' : 'on'}"><b>All products</b></a>`
  for (const [g, ids] of GROUPS) { h += `<h4>${g}</h4>`; for (const id of ids) { const s = list.find(x => x.id === id); if (s) h += `<a href="${rel}${s.id}/index.html" class="${cur === s.id ? 'on' : ''}"><span class="dot st-${s.status}"></span>${esc(s.title)}</a>` } }
  return h + '</nav>'
}
const kpiHtml = kpis => `<div class="kpis">${kpis.slice(0, 4).map(k => `<div><b class="${k.tone || ''}">${esc(k.value)}${k.delta ? `<i>${k.delta > 0 ? '▲' : '▼'}${Math.abs(k.delta)}</i>` : ''}</b>${esc(k.label)}</div>`).join('')}</div>`

function tile(s) {
  const img = s.views[0]
  return `<a class="tile" href="${s.id}/index.html" style="--lc:var(--l-${s.layer})"><div class="h"><b>${esc(s.title)}</b><span class="pill ${s.status}">${STATUS[s.status] || s.status}</span></div><small>${esc(s.step)}</small>
${s.kpis.length ? kpiHtml(s.kpis) : ''}${img ? `<div class="thumb"><img src="${s.id}/${img}" alt="" loading="lazy"></div>` : ''}${s.why ? `<div class="why">${esc(s.why)}</div>` : ''}</a>`
}

function hubPage(list, C) {
  let body = `<h1>Step products</h1><p class="lede">Each step of the discovery run publishes its own result: a card to read, pictures, an explorer where it helps, and the full data in a standard format. Open any tile; agents read the same cards as Markdown (<a href="index.md">index.md</a>).</p>`
  for (const [g, ids] of GROUPS) body += `<h2>${g}</h2><div class="tiles">${ids.map(id => list.find(s => s.id === id)).filter(Boolean).map(tile).join('')}</div>`
  body += `<h2>Ask across products</h2><pre>node bin/query.js &lt;out&gt; impact Travel          # what is affected if I change it
node bin/query.js &lt;out&gt; who-can "Travel DELETE"  # who may do it, static and measured
node bin/query.js &lt;out&gt; tests-for srv/travel-service.ts:105   # which tests reach this code</pre>`
  const app = C.facts().META?.title?.replace(/ Discovery Atlas$/, '') || C.manifest()?.app?.name || ''
  return head(`${app} step products`.trim()) + top(C) + `<div class="layout">${nav(list, null, '')}<main>${body}</main></div></body></html>\n`
}

function stepPage(s, md, list, C) {
  const src = md.replace(/^---[\s\S]*?---\n/, '')
  const renderer = new marked.Renderer()
  const code = renderer.code.bind(renderer)
  renderer.code = (tok) => (tok.lang === 'mermaid' ? `<pre class="mermaid">${esc(tok.text)}</pre>` : code(tok))
  let body = marked.parse(src, { renderer, gfm: true })
  body = body.replace(/href="\.\.\/index\.md"/g, 'href="../index.html"')
  const mer = /class="mermaid"/.test(body) ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script><script>mermaid.initialize({startOnLoad:true,theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"})</script>' : ''
  return head(`${s.title} · step products`) + top(C) + `<div class="layout">${nav(list, s.id, '../')}<main>${body}</main></div>${mer}</body></html>\n`
}

function hubMd(list, C) {
  const M = C.manifest() || {}
  const L = ['# Step products', '', `${M.app?.name || ''} ${M.app?.commit ? '@ ' + M.app.commit.slice(0, 7) : ''} · mode ${M.mode || 'static'} · ${new Date().toISOString().slice(0, 16)}Z`, '',
    'Each step of the run publishes its own product: `summary.json` (numbers), `README.md` (card with pictures), explorers (`*.html`) and `data/` (standard formats). Read a card, then drill down.', '']
  for (const [g, ids] of GROUPS) {
    L.push(`## ${g}`, '')
    L.push(table(['Product', 'Step', 'Status', 'Numbers'], ids.map(id => list.find(s => s.id === id)).filter(Boolean).map(s => [`[${s.title}](${s.id}/README.md)`, s.step, STATUS[s.status] || s.status, s.kpis.map(k => `${k.value} ${k.label}${k.delta ? ` (${k.delta > 0 ? '+' : ''}${k.delta})` : ''}`).join(' · ') || s.why || '']), { max: 50 }))
  }
  L.push('## Ask across products', '', '```sh', 'node bin/query.js <out> impact <Entity|ServiceEntity|file:line> [--depth 3] [--assoc]', 'node bin/query.js <out> who-can "<operation text>"', 'node bin/query.js <out> tests-for <file[:line]>', '```', '')
  return L.join('\n')
}

module.exports = { hubPage, stepPage, hubMd }
