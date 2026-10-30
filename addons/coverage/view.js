/* ---------- COV (addon coverage) ---------- */
const COVC={tested:'var(--good-soft)',gen:'var(--accent-soft)',spec:'var(--warn-soft)',likely:'var(--sunk)',fail:'var(--crit)',none:'var(--crit-soft)'}
const COVT={tested:'var(--good)',gen:'var(--accent)',spec:'var(--warn)',likely:'var(--muted)',fail:'#fff',none:'var(--crit)'}
const COVO=['tested','gen','spec','likely','fail','none']
function covCellState(cs){const t=cs.filter(c=>c.st==='tested').length;if(cs.some(c=>c.st==='fail'))return 'fail';if(t===cs.length)return 'tested';if(cs.every(c=>c.st==='none'))return 'none';if(cs.every(c=>c.st==='gen'||c.st==='tested'))return 'gen';return t||cs.some(c=>c.st==='spec')?'spec':'likely'}
function covLegend(){const C=D.COVERAGE;return `<p class="note">${COVO.map(s=>`<span class="cell" style="background:${COVC[s]};color:${COVT[s]};width:auto;padding:0 6px">${C.counts[s]}</span> ${esc(C.label[s])}`).join(' &nbsp; ')}</p>`}
function covDetail(ids){const by=new Map(D.COVERAGE.classes.map(c=>[c.id,c]));return ids.map(i=>by.get(i)).map(c=>`<div style="margin:8px 0"><span class="chip" style="background:${COVC[c.st]};color:${COVT[c.st]};border-color:${COVT[c.st]}">${esc(D.COVERAGE.label[c.st])}</span> <b>${esc(c.name)}</b><div class="mono" style="color:var(--muted)">${esc(c.id)}</div>${(c.tests||[]).map(t=>`<div>${chip(t.kind+': '+t.status,t.status==='passed'?'gd':t.status==='failed'?'cr':'')} ${esc(t.title)}</div>`).join('')}${c.request.map(r=>`<div>${chip('existing request','ac')} ${ev(r)}</div>`).join('')}${c.name_match?`<div>${chip('name match')} ${esc(c.name_match)}</div>`:''}${!(c.tests||[]).length&&!c.request.length&&!c.name_match?'<div class="note" style="margin:2px 0">No test touches this class yet.</div>':''}</div>`).join('')}
function covHeat(el){
 const C=D.COVERAGE,H=C.heat,by=new Map(C.classes.map(c=>[c.id,c]))
 el.innerHTML=`<div class="pw"><div class="scroll"><table class="mx heat" style="min-width:${Math.max(420,200+H.cols.length*70)}px"><thead><tr><th>Entity · operation</th>${H.cols.map(s=>`<th style="text-align:center">${esc(s)}</th>`).join('')}</tr></thead><tbody>${H.rows.map((r,i)=>`<tr><td><b>${esc(r)}</b></td>${H.cells[i].map((ids,j)=>{if(!ids.length)return '<td class="h"></td>';const cs=ids.map(x=>by.get(x)),st=covCellState(cs),t=cs.filter(c=>c.st==='tested').length;return `<td class="h"><button type="button" class="hc" data-c="${i}:${j}" title="${esc(C.label[st])}" style="width:100%;border:0;cursor:pointer;background:${COVC[st]};color:${COVT[st]}">${t}/${cs.length}</button></td>`}).join('')}</tr>`).join('')}</tbody></table></div><div class="detail" id="covd"><h3>Pick a cell</h3><p class="note">Each cell is one entity · operation in one state; the number is tested / classes. Click it to see the classes, the tests that cover them and the gaps.</p></div></div>${covLegend()}`
 el.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.c.split(':').map(Number);el.querySelector('#covd').innerHTML=`<h3>${esc(H.rows[i])} · ${esc(H.cols[j])}</h3>${covDetail(H.cells[i][j])}`})
}
function covBars(){
 const C=D.COVERAGE,R=[...C.cats].map(c=>({...c,t:COVO.reduce((a,s)=>a+c[s],0)})).sort((a,b)=>b.t-a.t),mx=Math.max(...R.map(c=>c.t)),W=900
 let b=''
 R.forEach((c,i)=>{const y=14+i*34;let x=220;b+=`<text x="0" y="${y+15}" style="font-size:13px;font-weight:600">${esc(c.n.length>28?c.n.slice(0,27)+'…':c.n)}</text>`
  COVO.forEach(s=>{if(!c[s])return;const w=c[s]/mx*560;b+=`<rect x="${x}" y="${y}" width="${w}" height="22" style="fill:${COVC[s]};stroke:${COVT[s]};stroke-opacity:.5"/>${w>18?`<text x="${x+w/2}" y="${y+15}" text-anchor="middle" style="font:700 11px var(--mono);fill:${COVT[s]}">${c[s]}</text>`:''}`;x+=w})
  b+=`<text x="${x+8}" y="${y+15}" class="mono">${c.tested} / ${c.t}</text>`})
 return `<div class="scroll">${svg(W,20+R.length*34,b)}</div>${covLegend()}`
}
function covNext(){
 const C=D.COVERAGE
 return `<div class="scroll"><table class="mx"><thead><tr><th>#</th><th>Class</th><th>Category</th><th>Status</th><th>Priority</th></tr></thead><tbody>${C.next.map((n,i)=>`<tr><td class="mono">${i+1}</td><td><b>${esc(n.name)}</b><div class="mono" style="color:var(--muted)">${esc(n.id)}</div></td><td>${esc(n.cat)}</td><td>${chip(C.label[n.st],n.st==='none'?'cr':'')}</td><td class="mono">${n.score}</td></tr>`).join('')}</tbody></table></div><p class="note">Untested and approximately matched classes, ranked by category weight (authorization and UI-vs-server first) and by the score of risks that name the same entity or operation.</p>`
}
ADDON_RENDER['COV-A']=covHeat;ADDON_RENDER['COV-B']=covBars;ADDON_RENDER['COV-C']=covNext
