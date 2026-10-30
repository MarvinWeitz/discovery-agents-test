/* ---------- NXT (addon nextsteps): ranked next steps, prompts, selection tray ---------- */
// the per-item "Do:" line is the Implement instruction; Plan and Tests only replace it with their closing text
const NX=D.NEXT,NXI=NX?NX.items:[]
const NXKEY='atlas.sel.'+(D.META.app||''),nxSel=new Set((store.get(NXKEY)||[]).filter(id=>NXI.some(x=>x.id===id)))
let nxMode=store.get('atlas.promptMode')||'implement'
const nxBandCls={P1:'cr',P2:'wn',P3:''}
document.head.insertAdjacentHTML('beforeend',`<style>
.nx{margin-top:16px;border-top:1px dashed var(--line);padding-top:12px}
.nx-h{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
.nx-h h3{font-size:20px;font-weight:600;margin-right:4px}
.nx-l{display:grid;gap:6px}
.it{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:4px 10px;align-items:start;border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:var(--bg)}
.it.on{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
.it input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--accent);cursor:pointer}
.bd{font:700 11px/1 var(--mono);border-radius:5px;padding:4px 5px;background:var(--sunk);color:var(--muted)}
.bd.P1{background:var(--crit);color:#fff}.bd.P2{background:var(--warn-soft);color:var(--warn)}
.it b{font-size:14.5px;font-weight:600}
.it .w{font-size:13px;color:var(--muted);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.it .m{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;min-width:0}
.it .m .chip{max-width:100%;overflow:hidden;text-overflow:ellipsis}
.it>div{min-width:0}
.it .acts{display:flex;gap:4px}
.it pre{grid-column:3/-1;white-space:pre-wrap;font:12px/1.45 var(--mono);background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:8px 10px;margin:4px 0 0;max-height:280px;overflow:auto}
@media (max-width:640px){.it{grid-template-columns:auto auto minmax(0,1fr)}.it .acts{grid-column:3}.side a .nb{display:none}}
.side a .nb{flex:0 0 auto;font:700 10.5px var(--mono);border-radius:4px;padding:1px 4px;background:var(--crit);color:#fff}
.side a .nb.P2{background:var(--warn-soft);color:var(--warn)}
.tray{position:sticky;bottom:max(8px,env(safe-area-inset-bottom,0px));z-index:8;margin-top:18px;background:var(--surface);border:1px solid var(--accent);border-radius:12px;padding:10px 14px;display:none;flex-wrap:wrap;gap:8px 12px;align-items:center;box-shadow:0 -6px 22px -12px rgba(0,0,0,.45)}
.tray.show{display:flex}
.tray b{font:600 19px var(--display)}
.tray .ids{display:flex;flex-wrap:wrap;gap:4px;flex:1 1 200px;min-width:0;max-height:52px;overflow:auto}
.tray .ids button{font:500 11px var(--mono);border:1px solid var(--line);background:var(--sunk);color:var(--fg);border-radius:5px;padding:1px 6px;cursor:pointer;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tray textarea{flex:1 0 100%;font:12px/1.45 var(--mono);min-height:180px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px;display:none}
.tray.pv textarea{display:block}
.nxf{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:10px}
.nxm .gc{cursor:pointer;border:0;font:700 15px var(--mono);display:grid;place-items:center}
.nxm .gc[aria-pressed="true"]{outline:3px solid var(--fg);outline-offset:-3px}
.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--fg);color:var(--bg);padding:8px 14px;border-radius:8px;font:600 14px var(--body);z-index:20;pointer-events:none}
</style>`)
const nxIdx=new Map(NXI.map((x,i)=>[x.id,i]))
function nxRow(x){const i=nxIdx.get(x.id),on=nxSel.has(x.id)
 return `<div class="it ${on?'on':''}" data-n="${i}"><input type="checkbox" data-sel="${i}" ${on?'checked':''} aria-label="Select ${esc(x.id)}"><span class="bd ${x.band}" title="impact ${x.i} × likelihood ${x.l} = ${x.score}">${x.band}</span><div><b>${esc(x.title)}</b><div class="w">${esc(x.why)}</div><div class="m">${chip(NX.kinds[x.kind],x.kind==='fix'?'cr':x.kind==='test'?'ac':x.kind==='verify'?'wn':'')}${x.secs.map(c=>`<a class="chip" href="#${c.toLowerCase()}" style="text-decoration:none">${c}</a>`).join('')}${x.ref.length<=12?chip(x.ref):''}${x.ev.slice(0,3).map(ev).join('')}</div></div><div class="acts"><button type="button" class="btn" data-pv="${i}" title="Show the prompt">Prompt</button><button type="button" class="btn pri" data-cp="${i}">Copy</button></div></div>`}
function nxList(list,limit){const more=list.length-limit
 return `<div class="nx-l">${list.slice(0,limit).map(nxRow).join('')}</div>${more>0?`<button type="button" class="btn" data-more style="margin-top:8px">Show ${more} more</button><div class="nx-l" hidden style="margin-top:6px">${list.slice(limit).map(nxRow).join('')}</div>`:''}`}
function nxPrompt(list){const P=NX.prompt,m=P.modes[nxMode]
 return [P.header,`Atlas: ${location.href.split('#')[0]} (facts: atlas-data.json next to it; Markdown: README.md)`,'',`## Tasks (${list.length}, highest priority first)`,'',...list.map(x=>(nxMode==='implement'?x.block:x.block.split('\n').filter(l=>!l.startsWith('Do: ')).join('\n'))+'\n'),'## How to work',m.text].join('\n')}
function nxToast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),1600)}
function nxCopy(txt,what){const fb=()=>{const tr=document.getElementById('tray');tr.classList.add('show','pv');const ta=tr.querySelector('textarea');ta.value=txt;ta.select();nxToast('Select all and copy')}
 try{navigator.clipboard.writeText(txt).then(()=>nxToast('Copied '+what),fb)}catch(e){fb()}}
function nxSync(){store.set(NXKEY,[...nxSel])
 document.querySelectorAll('[data-sel]').forEach(c=>{const on=nxSel.has(NXI[c.dataset.sel].id);c.checked=on;c.closest('.it').classList.toggle('on',on)})
 const tr=document.getElementById('tray'),list=NXI.filter(x=>nxSel.has(x.id))
 tr.classList.toggle('show',list.length>0);if(!list.length)tr.classList.remove('pv')
 tr.querySelector('b').textContent=`${list.length} selected`
 tr.querySelector('.ids').innerHTML=list.map(x=>`<button type="button" data-un="${nxIdx.get(x.id)}" title="Remove ${esc(x.title)}">${x.band} ${esc(x.id)} ✕</button>`).join('')
 if(tr.classList.contains('pv'))tr.querySelector('textarea').value=nxPrompt(list)}
// panel under every section, "Start here" on the overview
ADDON_PANELS.push((s,el)=>{
 if(!NX)return
 const home=s.code==='HOME',mine=home?NXI.filter(x=>x.band!=='P3'):NXI.filter(x=>x.secs.includes(s.code));if(!mine.length)return
 const c=b=>mine.filter(x=>x.band===b).length,top=mine.filter(x=>x.band!=='P3')
 const d=document.createElement('div');d.className='nx'
 d.innerHTML=`<div class="nx-h"><h3>${home?'Start here':'Next steps'}</h3>${['P1','P2','P3'].map(b=>c(b)?chip(c(b)+' '+b,nxBandCls[b]):'').join('')}<span style="flex:1"></span>${top.length?`<button type="button" class="btn" data-pick="${esc(s.code)}">Select ${home?'all P1 + P2':'P1 + P2 here'} (${top.length})</button>`:''}${home?`<a class="btn" href="#nxt" style="text-decoration:none">All next steps</a>`:''}</div>${nxList(mine,home?5:4)}`
 d.querySelector('[data-pick]')?.addEventListener('click',()=>{top.forEach(x=>nxSel.add(x.id));nxSync()})
 if(home)el.appendChild(d);else el.insertBefore(d,el.querySelector('.view').nextSibling)
})
ADDON_BADGES.push(code=>{if(!NX||code==='NXT')return '';const m=NXI.filter(x=>x.secs.includes(code)),p1=m.filter(x=>x.band==='P1').length,p2=m.filter(x=>x.band==='P2').length
 return p1?`<span class="nb" title="${p1} P1 next steps">${p1}</span>`:p2?`<span class="nb P2" title="${p2} P2 next steps">${p2}</span>`:''})
ADDON_INIT.push(()=>{
 if(!NX)return
 const tr=document.createElement('div');tr.className='tray';tr.id='tray'
 tr.innerHTML=`<b>0 selected</b><div class="ids"></div><span class="seg">${Object.entries(NX.prompt.modes).map(([k,m])=>`<button type="button" data-mode="${k}" aria-pressed="${k===nxMode}">${esc(m.label)}</button>`).join('')}</span><button type="button" class="btn" data-tray="pv">Preview</button><button type="button" class="btn" data-tray="clear">Clear</button><button type="button" class="btn pri" data-tray="copy">Copy prompt</button><textarea readonly aria-label="Combined prompt"></textarea>`
 document.querySelector('.content').appendChild(tr)
 tr.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return
  if(b.dataset.mode){nxMode=b.dataset.mode;store.set('atlas.promptMode',nxMode);tr.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',x===b));nxSync()}
  else if(b.dataset.un){nxSel.delete(NXI[b.dataset.un].id);nxSync()}
  else if(b.dataset.tray==='clear'){nxSel.clear();nxSync()}
  else if(b.dataset.tray==='pv'){tr.classList.toggle('pv');nxSync()}
  else if(b.dataset.tray==='copy'){const l=NXI.filter(x=>nxSel.has(x.id));nxCopy(nxPrompt(l),`${l.length} task${l.length>1?'s':''} as one prompt`)}})
 document.addEventListener('change',e=>{const c=e.target.closest('[data-sel]');if(!c)return;const id=NXI[c.dataset.sel].id;c.checked?nxSel.add(id):nxSel.delete(id);nxSync()})
 document.addEventListener('click',e=>{const b=e.target.closest('[data-cp],[data-pv],[data-more]');if(!b)return
  if(b.dataset.cp!==undefined)nxCopy(nxPrompt([NXI[b.dataset.cp]]),NXI[b.dataset.cp].id)
  else if(b.dataset.pv!==undefined){const it=b.closest('.it'),p=it.querySelector('pre');if(p){p.remove();return}it.insertAdjacentHTML('beforeend',`<pre>${esc(nxPrompt([NXI[b.dataset.pv]]))}</pre>`)}
  else{b.nextElementSibling.hidden=false;b.remove()}})
 nxSync()
})
function nxtList(el){
 const F={band:new Set(['P1','P2','P3']),kind:new Set(Object.keys(NX.kinds)),sec:''}
 const secs=[...new Set(NXI.flatMap(x=>x.secs))]
 el.innerHTML=`<div class="nxf"><span class="seg">${['P1','P2','P3'].map(b=>`<button type="button" data-fb="${b}" aria-pressed="true">${b} · ${NX.counts[b]}</button>`).join('')}</span><span class="seg">${Object.entries(NX.kinds).map(([k,l])=>`<button type="button" data-fk="${k}" aria-pressed="true">${l}</button>`).join('')}</span><select class="btn" data-fs><option value="">All sections</option>${secs.map(c=>`<option value="${c}">${c} · ${esc((byCode[c]||{}).name||c)}</option>`).join('')}</select><span style="flex:1"></span><button type="button" class="btn" data-all>Select all shown</button></div><div class="nxr"></div><p class="note">Priority = impact × likelihood (1–5 each), as in the risk heatmap: P1 ≥ 16, P2 ≥ 9, P3 below. A finding that several sections point at (same file:line) is listed once. Tick items, then copy one combined prompt from the bar at the bottom; choose Plan, Implement or Tests only there.</p>`
 const shown=()=>NXI.filter(x=>F.band.has(x.band)&&F.kind.has(x.kind)&&(!F.sec||x.secs.includes(F.sec)))
 const draw=()=>{const l=shown();el.querySelector('.nxr').innerHTML=l.length?nxList(l,25):'<p class="note">Nothing matches the filters.</p>'}
 const tog=(set,k,b)=>{set.has(k)?set.delete(k):set.add(k);b.setAttribute('aria-pressed',set.has(k));draw()}
 el.querySelectorAll('[data-fb]').forEach(b=>b.onclick=()=>tog(F.band,b.dataset.fb,b))
 el.querySelectorAll('[data-fk]').forEach(b=>b.onclick=()=>tog(F.kind,b.dataset.fk,b))
 el.querySelector('[data-fs]').onchange=e=>{F.sec=e.target.value;draw()}
 el.querySelector('[data-all]').onclick=()=>{shown().forEach(x=>nxSel.add(x.id));nxSync()}
 draw()
}
function nxtMatrix(el){
 const bg=(i,l)=>{const s=i*l;return s>=16?'var(--crit-soft)':s>=9?'var(--warn-soft)':'var(--sunk)'}
 let g='';for(let i=5;i>=1;i--){g+=`<div class="ax">${i}</div>`;for(let l=1;l<=5;l++){const n=NXI.filter(x=>x.i===i&&x.l===l).length;g+=n?`<button type="button" class="gc" data-c="${i}:${l}" style="background:${bg(i,l)}">${n}</button>`:`<div class="gc" style="background:${bg(i,l)};opacity:.5"></div>`}}
 g+=`<div></div>${[1,2,3,4,5].map(l=>`<div class="ax">${l}</div>`).join('')}`
 el.innerHTML=`<div class="rk"><div><div class="mono" style="color:var(--muted);margin-bottom:4px">impact ↑ · likelihood →</div><div class="grid5 nxm">${g}</div></div><div class="detail" id="nxmd"></div></div><p class="note">Every next step on the risk scale. The number is how many steps sit in the cell; red P1, amber P2, grey P3. Click a cell to list and select them.</p>`
 const show=k=>{const [i,l]=k.split(':').map(Number);el.querySelectorAll('.nxm [data-c]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.c===k));const m=NXI.filter(x=>x.i===i&&x.l===l)
  el.querySelector('#nxmd').innerHTML=`<h3>Impact ${i} × likelihood ${l} · ${m.length}</h3>${nxList(m,6)}`}
 el.querySelectorAll('.nxm [data-c]').forEach(b=>b.onclick=()=>show(b.dataset.c))
 const top=NXI[0];if(top)show(top.i+':'+top.l)
}
function nxtBySection(){
 const rows=ORDER.filter(s=>s.code!=='NXT').map(s=>{const m=NXI.filter(x=>x.secs.includes(s.code));return {s,c:['P1','P2','P3'].map(b=>m.filter(x=>x.band===b).length)}}).filter(r=>r.c.some(Boolean))
 const mx=Math.max(1,...rows.map(r=>r.c[0]+r.c[1]+r.c[2])),col=['var(--crit)','var(--warn)','var(--faint)'],W=900
 let b='';rows.forEach((r,k)=>{const y=14+k*34;let x=230;b+=`<a href="#${r.s.code.toLowerCase()}"><text x="0" y="${y+15}" style="font-size:13px;font-weight:600;fill:var(--accent)">${r.s.code} · ${esc(r.s.name.length>24?r.s.name.slice(0,23)+'…':r.s.name)}</text></a>`
  r.c.forEach((n,j)=>{if(!n)return;const w=n/mx*560;b+=`<rect x="${x}" y="${y}" width="${w}" height="22" style="fill:${col[j]};opacity:${j===2?.45:.85}"/>${w>20?`<text x="${x+w/2}" y="${y+15}" text-anchor="middle" style="font:700 11px var(--mono);fill:#fff">${n}</text>`:''}`;x+=w})
  b+=`<text x="${x+8}" y="${y+15}" class="mono">${r.c.join(' / ')}</text>`})
 return `<div class="scroll">${svg(W,20+rows.length*34,b)}</div><p class="note">Next steps per section: red P1, amber P2, grey P3. A step that two sections point at counts in both. Click a section name to open it; its steps are listed under its views.</p>`
}
if(NX){ADDON_RENDER['NXT-A']=nxtList;ADDON_RENDER['NXT-B']=nxtMatrix;ADDON_RENDER['NXT-C']=nxtBySection}
