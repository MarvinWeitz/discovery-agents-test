// Product "Project passport": how CAP itself sees the project (run/project.json from the probe):
// profiles, database / auth / messaging per profile, plugins, model files, services, implementations.
const svg = require('../svg')
const { table } = require('../md')

const PROFILES = ['development', 'test', 'production']
const kindOf = v => (v && typeof v === 'object' ? v.kind || (v.impl ? String(v.impl).split('/').pop() : 'configured') : v === true ? 'on' : v ? String(v) : '')

module.exports = {
  id: 'project', title: 'Project passport', step: 'Probe and intake', layer: 'run',
  does: 'How CAP sees the project: profiles, database, auth and messaging per profile, plugins, model files, services and their implementations.',
  from: ['run/project.json'],
  build(C) {
    const P = C.project()
    if (!P) return { status: 'empty', why: 'no run/project.json' }
    const env = { development: P, test: P.test || P, production: P.production || P }
    const svcRows = ['db', 'auth', 'messaging']
    const cellText = (prof, s) => s === 'db' ? (P.db?.[prof]?.kind || '') : kindOf(env[prof]?.requires?.[s])
    const color = t => !t ? null : /hana|xsuaa|ias|enterprise|event-mesh|jwt/.test(t) ? '#3f7fbf' : /mock|sqlite|local|file-based|dummy/.test(t) ? '#8c959f' : '#138a7e'
    const view = svg.matrix(svcRows, PROFILES, (i, j) => { const t = cellText(PROFILES[j], svcRows[i]); return t ? { text: t, color: color(t), title: `${PROFILES[j]} · ${svcRows[i]}: ${t}` } : null }, { title: 'Profile matrix', cw: 120 })
    const impls = Object.entries(P.impls || {})
    const md = [
      `CAP ${P.cds?.version || '?'} (${P.cds?.from || '?'}) · ${P.typescript ? 'TypeScript' : 'JavaScript'} · ${P.model?.files?.length || 0} model files · ${(P.services || []).length} services · ${Object.keys(P.seed || {}).length} seed files`, '',
      '![profile matrix](views/profiles.svg)', '',
      '### Services', '', table(['Service', 'Endpoints', 'Implementation'], (P.services || []).map(s => [s.name, (s.endpoints || []).map(e => `${e.kind} ${e.path}`).join(', '), P.impls?.[s.name]?.file || 'none (generic CAP)'])),
      '### Plugins', '', (P.plugins || []).length ? (P.plugins || []).map(p => `- \`${p}\``).join('\n') + '\n' : '_none_\n',
      '### Doctor', '', P.ok && !(P.errors || []).length ? 'CAP answered every probe question.\n' : table(['Problem'], (P.errors || []).map(e => [typeof e === 'string' ? e : JSON.stringify(e)])),
    ].join('\n')
    return {
      status: P.ok ? 'ok' : 'warn',
      kpis: [{ label: 'services', value: (P.services || []).length }, { label: 'model files', value: P.model?.files?.length || 0 }, { label: 'plugins', value: (P.plugins || []).length }, { label: 'without own code', value: impls.filter(([, v]) => !v).length }],
      md, views: { 'profiles.svg': view }, data: { 'project.json': P },
    }
  },
}
