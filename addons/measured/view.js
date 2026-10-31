/* ---------- MSR (addon measured) ---------- */
function msrAuthz(){
 const A=D.MEASURED&&D.MEASURED.authz; if(!A) return '<p class="note">Not measured in this run.</p>'
 const mark={agree:'✅',differ:'❗',measured:'◽'}
 const rows=A.rows.map(r=>`<tr><td>${esc(r.op)}</td>${r.cells.map(c=>`<td title="HTTP ${c.status}">${mark[c.st]} ${esc(c.static)}→${esc(c.measured)}</td>`).join('')}</tr>`).join('')
 return `<table><thead><tr><th>Operation</th>${A.users.map(u=>`<th>${esc(u)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
 <p class="note">static value → what CAP answered. ✅ agree · ❗ differ · ◽ measured where the static matrix was unclear. n = 401/403, n405 = Capabilities.</p>`
}
function msrRequests(){
 const R=D.MEASURED&&D.MEASURED.requests; if(!R) return '<p class="note">Not measured in this run.</p>'
 const rows=R.rows.slice(0,60).map(r=>`<tr><td>${esc((r.entity||'')+' · '+r.event)}</td><td>${r.n}</td><td>${esc(r.users.join(', '))}</td><td>${esc(Object.entries(r.outcomes).map(([k,v])=>k+'×'+v).join(' '))}</td><td class="mono">${esc(r.tests.slice(0,3).join(', '))}</td></tr>`).join('')
 return `<table><thead><tr><th>Entity · event</th><th>Requests</th><th>Users</th><th>Status</th><th>Test files</th></tr></thead><tbody>${rows}</tbody></table>`
}
function msrRules(){
 const M=D.MEASURED&&D.MEASURED.rules; if(!M) return '<p class="note">Not measured in this run.</p>'
 return `<p>${M.reached} of ${M.measured} handler rules ran in at least one test.</p><table><thead><tr><th>Never run</th><th>Kind</th><th>Guard</th></tr></thead><tbody>${M.never.map(r=>`<tr><td>${ev(r.ev)}</td><td>${esc(r.kind)}</td><td class="mono">${esc(r.guard)}</td></tr>`).join('')}</tbody></table>`
}
ADDON_RENDER['MSR-A']=msrAuthz
ADDON_RENDER['MSR-B']=msrRequests
ADDON_RENDER['MSR-C']=msrRules
