// Product "Project passport": how CAP itself sees the project (run/project.json from the probe):
// profiles, database / auth / messaging per profile, plugins, model files, services, implementations.
const svg = require('../svg')

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
      '### Profiles', '', '{{view:profiles.svg}}',
      '### Services', '', '{{list:services}}',
      '### Plugins', '', '{{list:plugins}}',
      '### Doctor', '', P.ok && !(P.errors || []).length ? 'CAP answered every probe question.\n' : '{{list:problems}}',
    ].join('\n')
    return {
      status: P.ok ? 'ok' : 'warn',
      kpis: [{ label: 'services', value: (P.services || []).length }, { label: 'model files', value: P.model?.files?.length || 0 }, { label: 'plugins', value: (P.plugins || []).length }, { label: 'without own code', value: impls.filter(([, v]) => !v).length }],
      md, views: { 'profiles.svg': view }, lists: { plugins: { title: 'Plugins', noun: 'plugins', columns: [{ key: 'name', label: 'Plugin' }], rows: (P.plugins || []).map(name => ({ name: '`' + name + '`' })), sort: { key: 'name', dir: 'asc' }, empty: '_none_' }, problems: { title: 'Probe problems', noun: 'problems', columns: [{ key: 'problem', label: 'Problem' }], rows: (P.errors || []).map(e => ({ problem: typeof e === 'string' ? e : JSON.stringify(e) })) }, services: { title: 'Services', noun: 'services', what: 'Every service CAP serves, its endpoints and the file that implements it.',
        columns: [{ key: 'name', label: 'Service' }, { key: 'protocols', label: 'Protocols', facet: true }, { key: 'endpoints', label: 'Endpoints' }, { key: 'code', label: 'Own code', facet: true }, { key: 'impl', label: 'Implementation' }],
        rows: (P.services || []).map(s => ({ name: s.name, protocols: [...new Set((s.endpoints || []).map(e => e.kind))], endpoints: (s.endpoints || []).map(e => `${e.kind} ${e.path}`).join(', '), code: P.impls?.[s.name]?.file ? 'yes' : 'no', impl: P.impls?.[s.name]?.file || 'none (generic CAP)' })), sort: { key: 'name', dir: 'asc' } } }, data: { 'project.json': P },
    }
  },
}
