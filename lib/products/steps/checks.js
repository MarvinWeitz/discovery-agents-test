// Product "Code findings": every static finding with a code location (lint, Opengrep / rules library,
// coding patterns, layer violations, native SQL, risks) in SARIF 2.1.0, the OASIS format that VS Code's
// SARIF Viewer, GitHub code scanning and most CI tools read. L1: hotspot treemap and rule counts.
const svg = require('../svg')
const { table } = require('../md')

const KINDS = ['lint', 'rule-hit', 'pattern', 'layer-violation', 'native-sql', 'risk', 'agent-risk', 'action-without-handler', 'state-transition']
const LEVEL = { critical: 'error', warning: 'warning', info: 'note', good: 'none', none: 'none' }

function sarif(fs, version) {
  const rules = [...new Map(fs.map(f => [f.kind + (f.data?.rule ? ':' + f.data.rule : ''), f])).entries()]
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'cap-discovery', version, informationUri: 'https://github.com/MarvinWeitz/discovery-agents-test', rules: rules.map(([id, f]) => ({ id, shortDescription: { text: id } })) } },
      results: fs.map(f => ({
        ruleId: f.kind + (f.data?.rule ? ':' + f.data.rule : ''), level: LEVEL[f.severity?.level] || 'note',
        message: { text: `${f.title}. ${f.statement || ''}`.trim() },
        locations: (f.evidence || []).filter(e => e.file).slice(0, 5).map(e => ({ physicalLocation: { artifactLocation: { uri: e.file }, ...(e.line ? { region: { startLine: e.line } } : {}) } })),
        properties: { id: f.id, method: f.method, status: f.status, confidence: f.confidence, layer: f.layer },
      })),
    }],
  }
}

module.exports = {
  id: 'checks', title: 'Code findings', step: 'Lint, Opengrep, rules', layer: 'code',
  does: 'Every static finding with a code location in one standard format (SARIF), by file and by rule.',
  from: ['run/findings/findings.jsonl'],
  build(C) {
    const all = C.findings().filter(f => KINDS.includes(f.kind) && (f.evidence || []).some(e => e.file) && f.severity?.level !== 'good')
    if (!all.length) return { status: 'ok', kpis: [{ label: 'findings', value: 0 }], md: 'No static finding with a code location.\n', data: { 'checks.sarif': sarif([], C.manifest()?.toolkit?.version) } }
    const byFile = {}, byKind = {}
    for (const f of all) { const file = f.evidence.find(e => e.file).file; (byFile[file] ||= []).push(f); byKind[f.kind] = (byKind[f.kind] || 0) + 1 }
    const sev = list => list.some(f => f.severity?.level === 'critical') ? '#c2414b' : list.some(f => f.severity?.level === 'warning') ? '#c27c0e' : '#3f7fbf'
    const hot = svg.tree(Object.entries(byFile).map(([file, list]) => ({ label: file, value: list.length, color: sev(list), note: `${list.length} findings` })), { title: 'Findings by file (red has a critical, amber a warning)' })
    const kinds = svg.bars(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: n, tone: 'info' })), { title: 'Findings by kind' })
    const crit = all.filter(f => ['critical', 'warning'].includes(f.severity?.level))
    const md = [
      `${all.length} findings in ${Object.keys(byFile).length} files · ${crit.length} critical or warning. Full list as SARIF: [checks.sarif](data/checks.sarif) (open it in VS Code's SARIF Viewer or upload it to code scanning).`, '',
      '![hotspots](views/hotspots.svg)', '', '![by kind](views/kinds.svg)', '',
      '### Critical and warnings', '', table(['Severity', 'Kind', 'Title', 'Where'], crit.sort((a, b) => (a.severity.level === 'critical' ? 0 : 1) - (b.severity.level === 'critical' ? 0 : 1)).map(f => [f.severity.level, f.kind, f.title, f.evidence.filter(e => e.file).map(e => `${e.file}${e.line ? ':' + e.line : ''}`)[0]]), { max: 20 }),
    ].join('\n')
    return {
      status: all.some(f => f.severity?.level === 'critical') ? 'bad' : crit.length ? 'warn' : 'ok',
      kpis: [{ label: 'findings', value: all.length }, { label: 'files', value: Object.keys(byFile).length }, { label: 'critical', value: all.filter(f => f.severity?.level === 'critical').length, tone: 'bad' }, { label: 'warnings', value: all.filter(f => f.severity?.level === 'warning').length, tone: 'warn' }],
      md, views: { 'hotspots.svg': hot, 'kinds.svg': kinds }, data: { 'checks.sarif': sarif(all, C.manifest()?.toolkit?.version) },
    }
  },
}
