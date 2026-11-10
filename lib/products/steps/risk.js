// Product "Risk list": one ranking per file that joins three signals the other products show apart:
// how often the file changes (git history), what was found in it (findings, weighted by severity) and
// which of its handler rules no test runs (measured in CI; before a CI run, every rule counts as unknown).
// Each signal is scaled to 0..1 against the file with the most of it, so the score (0..3) says where a
// change is most likely to break something nobody notices. The idea: hotspots × defects × test gaps.
const { gitHistory } = require('./history')

const W = { critical: 3, warning: 2, info: 1 }
const KEYS = [{ key: 'change', label: 'changes often', color: '#3f7fbf' }, { key: 'found', label: 'findings', color: '#c27c0e' }, { key: 'untested', label: 'rules no test runs', color: '#c2414b' }]
const kindOf = f => /(^|\/)(test|tests|__tests__)\/|\.test\.|\.spec\.|qunit|opa/i.test(f) ? 'test' : /^app\/|\/webapp\//.test(f) ? 'ui' : /\.cds$/.test(f) ? 'model' : 'code'

module.exports = {
  id: 'risk', title: 'Risk list', step: 'History × findings × tests', layer: 'code',
  does: 'One ranking per file joining how often it changes, what was found in it, and which of its rules no test runs.',
  from: ['git log', 'run/findings/findings.jsonl', 'run/graph/ (Rule)', 'atlas-data.json MEASURED.rules (CI)'],
  build(C) {
    const H = gitHistory(C), findings = C.findings(), rules = C.nodes().filter(n => n.type === 'Rule'), M = C.facts().MEASURED?.rules
    const never = new Set((M?.never || []).map(r => r.id))
    const by = {}
    const at = f => (by[f] ||= { file: f, commits: 0, lines: 0, crit: 0, warn: 0, info: 0, weight: 0, rules: 0, unrun: 0 })
    // package manifests change with every dependency bump: that is churn, not risk
    for (const f of H.files || []) if (!/(^|\/)package(-lock)?\.json$/.test(f.file)) Object.assign(at(f.file), { commits: f.commits, lines: f.lines })
    for (const x of findings) {
      const lvl = x.severity?.level; if (!W[lvl]) continue
      const file = (x.evidence || []).find(e => e.file)?.file; if (!file) continue
      const r = at(file); r.weight += W[lvl]; r[lvl === 'critical' ? 'crit' : lvl === 'warning' ? 'warn' : 'info']++
    }
    for (const r of rules) { const file = String(r.evidence || '').split(':')[0]; if (!file) continue; const x = at(file); x.rules++; if (!M || never.has(r.id)) x.unrun += M ? 1 : 0.5 }
    // files deleted or renamed since keep their history; only files in today's checkout are ranked
    const root = C.root(), fs = require('fs'), path = require('path')
    const rows = Object.values(by).filter(r => !root || fs.existsSync(path.join(root, r.file)))
    if (!rows.length) return { status: 'empty', why: 'no history, findings or rules to rank' }
    const max = k => Math.max(1, ...rows.map(r => r[k]))
    const mc = max('commits'), mw = max('weight'), mu = Math.max(1, ...rows.map(r => r.unrun))
    for (const r of rows) {
      r.change = +(r.commits / mc).toFixed(2); r.found = +(r.weight / mw).toFixed(2); r.untested = +(r.unrun / mu).toFixed(2)
      r.score = +(r.change + r.found + r.untested).toFixed(2)
      const parts = [r.commits ? `${r.commits} commits` : '', r.crit || r.warn || r.info ? [r.crit && `${r.crit} critical`, r.warn && `${r.warn} warnings`, r.info && `${r.info} info`].filter(Boolean).join(', ') : '', r.rules ? (M ? `${r.unrun} of ${r.rules} rules never run` : `${r.rules} rules, not measured yet`) : '']
      r.why = parts.filter(Boolean).join(' · ')
      r.driver = KEYS.map(k => [k.label, r[k.key]]).sort((a, b) => b[1] - a[1])[0][0]
      r.kind = kindOf(r.file); r.folder = r.file.includes('/') ? r.file.split('/').slice(0, -1).join('/') : '.'
    }
    const ranked = rows.filter(r => r.score > 0)
    const top = ranked.slice().sort((a, b) => b.score - a.score)[0]
    const src = ranked.filter(r => r.kind !== 'test')
    const md = [
      `${ranked.length} files carry at least one signal; ${src.filter(r => r.score >= 1).length} source files score 1 or more (out of 3). ${H.files ? `History: ${H.commits.length} commits.` : `No git history here (${H.why}): only findings and rules count.`} ${M ? `Rules measured in CI: ${M.reached} of ${M.measured} reached.` : 'Rules not measured yet (CI): each counts half as untested.'}`, '',
      '{{list:files}}',
    ].join('\n')
    return {
      status: top && top.score >= 2 ? 'warn' : 'ok',
      kpis: [{ label: 'files ranked', value: ranked.length }, { label: `riskiest: ${top?.file.split('/').pop() || '-'}`, value: top?.score ?? 0 }, { label: 'score ≥ 1 (source)', value: src.filter(r => r.score >= 1).length, tone: 'warn' }, { label: 'rules never run', value: M ? never.size : 'in CI' }],
      md,
      lists: { files: {
        title: 'Risk per file', noun: 'files',
        columns: [{ key: 'file', label: 'File' }, { key: 'score', label: 'Risk (0-3)', num: true }, ...KEYS.map(k => ({ key: k.key, label: k.label, num: true })), { key: 'why', label: 'Because' }, { key: 'driver', label: 'Main driver', facet: true }, { key: 'kind', label: 'Kind', facet: true }, { key: 'folder', label: 'Folder', facet: true }],
        rows: ranked, sort: { key: 'score', dir: 'desc' }, chart: { kind: 'stacked', label: 'file', keys: KEYS, title: 'Risk per file: changes often + findings + rules no test runs' },
      } },
      data: { 'risk.json': ranked.map(({ crit, warn, info, weight, unrun, ...r }) => ({ ...r, critical: crit, warnings: warn, infos: info, unrunRules: unrun })) },
    }
  },
}
