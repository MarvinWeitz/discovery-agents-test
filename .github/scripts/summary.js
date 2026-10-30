// Writes the GitHub job summary: pipeline numbers and the result of every generated test.
const fs = require('fs')
const path = require('path')
const out = process.argv[2] || 'out'
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')) } catch { return null } }

const lines = ['# SFlight discovery run', '']
const atlas = read('cap-sflight/atlas-data.json')
if (atlas) {
  lines.push('| Metric | Value |', '| --- | --- |')
  for (const [v, l] of atlas.KPIS || []) lines.push(`| ${l} | ${v} |`)
  lines.push('')
} else lines.push('Pipeline produced no atlas-data.json.', '')

for (const [name, file] of [['Generated tests', 'jest-generated.json'], ['SFlight own tests (baseline)', 'jest-baseline.json']]) {
  const j = read(file)
  if (!j) { lines.push(`## ${name}`, '', 'No result (step did not run or crashed before Jest wrote its report).', ''); continue }
  lines.push(`## ${name}`, '', `${j.numPassedTests} passed, ${j.numFailedTests} failed, ${j.numPendingTests} skipped (spec tests), ${j.numTotalTests} total`, '')
  if (name.startsWith('Generated')) {
    lines.push('| Result | Test | Detail |', '| --- | --- | --- |')
    for (const s of j.testResults) for (const t of s.assertionResults) {
      const msg = (t.failureMessages || []).join(' ').split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '').replace(/\|/g, '\\|').slice(0, 160)
      lines.push(`| ${t.status === 'passed' ? 'pass' : t.status === 'pending' ? 'skip' : '**FAIL**'} | ${t.title.replace(/\|/g, '\\|')} | ${msg} |`)
    }
    for (const s of j.testResults) if (s.status === 'failed' && !s.assertionResults.length) lines.push('', '```', s.message.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 2000), '```')
    lines.push('')
  }
}
console.log(lines.join('\n'))
