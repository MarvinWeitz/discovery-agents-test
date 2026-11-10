// Product "Code findings": every static finding with a code location (lint, Opengrep / rules library,
// coding patterns, layer violations, native SQL, risks) in SARIF 2.1.0, the OASIS format that VS Code's
// SARIF Viewer, GitHub code scanning and most CI tools read. L1: hotspot treemap and rule counts.
const svg = require('../svg')

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
    const lvl = list => list.some(f => f.severity?.level === 'critical') ? 'critical' : list.some(f => f.severity?.level === 'warning') ? 'warning' : 'info'
    const files = {
      title: 'Findings by file', noun: 'files', what: 'Every file with a finding. In the picture size = number of findings, red = has a critical, amber = has a warning.',
      columns: [{ key: 'file', label: 'File' }, { key: 'folder', label: 'Folder', facet: true }, { key: 'worst', label: 'Worst', facet: true }, { key: 'kinds', label: 'Kinds', facet: true }, { key: 'findings', label: 'Findings', num: true }],
      rows: Object.entries(byFile).map(([file, list]) => ({ file, folder: file.includes('/') ? file.split('/').slice(0, -1).join('/') : '.', worst: lvl(list), kinds: [...new Set(list.map(f => f.kind))], findings: list.length, _c: sev(list), _n: `${list.length} findings` })),
      sort: { key: 'findings', dir: 'desc' }, chart: { kind: 'tree', label: 'file', value: 'findings', title: 'Findings by file (red has a critical, amber a warning)' }, inline: 20,
    }
    const SEV = { critical: 3, warning: 2, info: 1 }
    const list = {
      title: 'All findings', noun: 'findings', what: 'Every static finding with a code location, most severe first. The same list in SARIF: data/checks.sarif.',
      columns: [{ key: 'severity', label: 'Severity', facet: true }, { key: 'kind', label: 'Kind', facet: true }, { key: 'title', label: 'Title' }, { key: 'where', label: 'Where' }, { key: 'folder', label: 'Folder', facet: true }, { key: 'rank', label: 'Severity rank', num: true, hide: true }],
      rows: all.map(f => { const e = f.evidence.find(e => e.file); return { severity: f.severity?.level || 'info', kind: f.kind, title: f.title, where: `${e.file}${e.line ? ':' + e.line : ''}`, folder: e.file.includes('/') ? e.file.split('/').slice(0, -1).join('/') : '.', rank: SEV[f.severity?.level] || 0 } }),
      sort: { key: 'rank', dir: 'desc' },
    }
    const kinds = svg.bars(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: n, tone: 'info' })), { title: 'Findings by kind' })
    const crit = all.filter(f => ['critical', 'warning'].includes(f.severity?.level))
    const md = [
      `${all.length} findings in ${Object.keys(byFile).length} files · ${crit.length} critical or warning. Full list as SARIF: [checks.sarif](data/checks.sarif) (open it in VS Code's SARIF Viewer or upload it to code scanning).`, '',
      '![by kind](views/kinds.svg)', '',
      '### Hotspot files', '', '{{list:files}}',
      '### Findings', '', '{{list:findings}}',
    ].join('\n')
    return {
      status: all.some(f => f.severity?.level === 'critical') ? 'bad' : crit.length ? 'warn' : 'ok',
      kpis: [{ label: 'findings', value: all.length }, { label: 'files', value: Object.keys(byFile).length }, { label: 'critical', value: all.filter(f => f.severity?.level === 'critical').length, tone: 'bad' }, { label: 'warnings', value: all.filter(f => f.severity?.level === 'warning').length, tone: 'warn' }],
      md, views: { 'kinds.svg': kinds }, lists: { files, findings: list }, data: { 'checks.sarif': sarif(all, C.manifest()?.toolkit?.version) },
    }
  },
}
