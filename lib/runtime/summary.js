// Writes the GitHub job summary: pipeline numbers and the result of every generated test.
//   node summary.js <out> [app-dir] [title]
// <out>/<app-dir>/atlas-data.json   pipeline KPIs
// <out>/jest-generated.json, <out>/jest-baseline.json   Jest reports (optional)
// <out>/result.json                 run facts from the discover workflow (optional: link, startup)
const fs = require('fs')
const path = require('path')
const [out = 'out', appDir = 'cap-sflight', title = 'SFlight discovery run'] = process.argv.slice(2)
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')) } catch { return null } }

const lines = [`# ${title}`, '']
const result = read('result.json')
if (result) {
  lines.push(`**${result.repo}**${result.ref ? ` @ ${result.ref}` : ''} · commit \`${String(result.commit).slice(0, 7)}\` · app folder \`${result.app}\`${result.ui ? ` · UI \`${result.ui}\`` : ''}`, '')
  if (result.atlas_url) lines.push(`**Atlas:** ${result.atlas_url}`, '')
  else if (result.publish_note) lines.push(`**Atlas:** ${result.publish_note}`, '')
  if (result.startup && result.startup !== 'ok') lines.push(`**Runtime tests skipped:** the app did not start under cds.test (${result.startup}).`, '')
}
const atlas = read(`${appDir}/atlas-data.json`)
if (atlas) {
  lines.push('| Metric | Value |', '| --- | --- |')
  for (const [v, l] of atlas.KPIS || []) lines.push(`| ${l} | ${v} |`)
  lines.push('')
} else lines.push('Pipeline produced no atlas-data.json.', '')

for (const [name, file] of [['Generated tests', 'jest-generated.json'], ['Own tests (baseline)', 'jest-baseline.json']]) {
  const j = read(file)
  if (!j) {
    if (name.startsWith('Generated') && result?.startup !== 'ok' && result) continue
    if (name.startsWith('Own') && result) continue
    lines.push(`## ${name}`, '', 'No result (step did not run or crashed before Jest wrote its report).', ''); continue
  }
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
