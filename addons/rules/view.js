/* ---------- RLS (addon rules) ---------- */
function rlsCards(){
 return `<div class="cards">${D.RULES.rules.map(r=>`<div class="card ${r.status==='accepted'?'gd':r.hits.length?'wn':''}"><div class="meta">${chip(r.status,r.status==='accepted'?'gd':'wn')}${chip(r.hits.length+' hit'+(r.hits.length===1?'':'s'),r.hits.length?'cr':'')}${r.reproduces.map(a=>chip('reproduces '+a,'ac')).join('')}</div><h3>${esc(r.title)}</h3><p class="mono">${esc(r.key)}</p>${r.hits.map(h=>`<p>${esc(h.t)} ${ev(h.ev)}</p>`).join('')}${r.error?`<p>Error: ${esc(r.error)}</p>`:''}<p><b style="color:var(--fg)">From:</b> ${esc(r.from)}</p><p><b style="color:var(--fg)">Run by:</b> ${esc(r.via||"own detect()")}</p></div>`).join('')}</div><p class="note">Agents find, rules take over: each card is a deterministic detector drafted from an agent finding. Amber: draft that fires here, waiting for review. Green: accepted, its hits are in the risk list.</p>`
}
ADDON_RENDER['RLS-A']=rlsCards
