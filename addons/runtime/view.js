/* ---------- RTM (addon runtime) ---------- */
function rtmTable(){
 const R=D.RUNTIME, icon={confirmed:'✅','runtime-only':'❗','static-only':'⚠️'}
 const rows=[...R.rows,...R.staticOnly].map(r=>`<tr><td>${icon[r.status]}</td><td>${esc(r.service||'')}</td><td>${esc(r.phase)}</td><td>${esc(r.event)}</td><td>${esc(r.path)}</td><td>${ev(r.ev)}</td></tr>`).join('')
 const svc=R.services.map(s=>`<tr><td>${esc(s.name)}</td><td class="mono">${esc(s.runtime)}</td><td class="mono">${esc(s.static||'')}</td><td>${s.ok?'✅':'❗'}</td></tr>`).join('')
 return `<table><thead><tr><th></th><th>Service</th><th>Phase</th><th>Event</th><th>Entity</th><th>Where</th></tr></thead><tbody>${rows}</tbody></table>
 <h3>Service paths</h3><table><thead><tr><th>Service</th><th>Served at</th><th>Predicted</th><th></th></tr></thead><tbody>${svc}</tbody></table>
 <p class="note">✅ registered by the running app and found by the parser · ❗ registered, parser missed it · ⚠️ parsed, not registered at startup.</p>`
}
ADDON_RENDER['RTM-A']=rtmTable
