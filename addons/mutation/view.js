/* ---------- MUT (addon mutation) ---------- */
function mutSurvivors(){
 const M=D.MUTATION
 return `<div class="cards">${M.survivors.slice(0,60).map(s=>`<div class="card ${s.status==='NoCoverage'?'wn':'cr'}"><div class="meta">${chip(s.status==='NoCoverage'?'no test reaches it':'survived',s.status==='NoCoverage'?'wn':'cr')}${chip(s.mutator)}</div><h3>${esc(s.says)}</h3><p>${s.factLabel?`In <b>${esc(s.factLabel)}</b>. `:''}${s.coveredBy.length?`Ran ${s.coveredBy.length} test${s.coveredBy.length>1?'s':''}, none failed.`:'No test executes this line.'}</p><div class="meta">${ev(s.file+':'+s.line)}</div></div>`).join('')}</div><p class="note">Each card is a small change to the code that no test noticed. Red: tests ran the line but did not check its effect. Amber: no test reaches it.</p>`
}
function mutClasses(){
 const M=D.MUTATION,W=900;if(!M.classes.length)return '<p class="note">No generated test reached a mutant.</p>'
 let b='';M.classes.forEach((c,i)=>{const y=14+i*30,w=c.score/100*480;b+=`<text x="0" y="${y+14}" style="font-size:12px">${esc(c.cls.length>48?c.cls.slice(0,47)+'…':c.cls)}</text><rect x="340" y="${y}" width="480" height="20" rx="4" style="fill:var(--crit-soft)"/><rect x="340" y="${y}" width="${w}" height="20" rx="4" style="fill:${c.score>=80?'var(--good)':c.score>=50?'var(--warn)':'var(--crit)'}"/><text x="828" y="${y+14}" class="mono">${c.score}% · ${c.killed}/${c.covered}</text>`})
 return `<div class="scroll">${svg(W,20+M.classes.length*30,b)}</div><p class="note">Per equivalence class: of the mutants its generated tests reach, the share they kill. A low bar is a test that runs the code but does not pin its result.</p>`
}
ADDON_RENDER['MUT-A']=mutSurvivors;ADDON_RENDER['MUT-B']=mutClasses
