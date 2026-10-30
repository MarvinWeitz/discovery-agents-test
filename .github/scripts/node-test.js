// Runs cds.test suites with Node's own test runner and writes a Jest-format JSON report, for apps whose
// tests do not run under Jest (Jest's module sandbox breaks cds 10 and some SAP Cloud SDK packages).
//   node node-test.js <test-dir> --outputFile <report.json>      (run from the app folder)
// describe / it / before / after become globals, as with Mocha or Jest, so the generated tests run unchanged.
const fs = require('fs')
const path = require('path')
const nt = require('node:test')

const args = process.argv.slice(2)
const dir = path.resolve(args.find(a => !a.startsWith('--')) || 'test')
const out = args[args.indexOf('--outputFile') + 1]
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.test\.[cm]?js$/.test(e.name) ? [path.join(d, e.name)] : [])
const files = walk(dir)

Object.assign(globalThis, { describe: nt.describe, it: nt.it, test: nt.test, before: nt.before, after: nt.after, beforeEach: nt.beforeEach, afterEach: nt.afterEach, beforeAll: nt.before, afterAll: nt.after })

const results = new Map(files.map(f => [f, { name: f, status: 'passed', message: '', assertionResults: [] }]))
const stack = []
const stream = nt.run({ files, isolation: 'none', concurrency: false, timeout: 120000 })
const on = {}
stream.on('data', ev => on[ev.type]?.(ev.data)) // reading the stream is what lets it end
on['test:start'] = d => { stack[d.nesting] = d.name; stack.length = d.nesting + 1 }
const done = (d, status) => {
  if (d.details?.type === 'suite') { if (status === 'failed' && !d.details.error?.failureType?.includes('subtest')) fileOf(d).message ||= msg(d); return }
  const r = fileOf(d), ancestorTitles = stack.slice(0, d.nesting)
  r.assertionResults.push({ ancestorTitles, title: d.name, fullName: [...ancestorTitles, d.name].join(' '), status, failureMessages: status === 'failed' ? [msg(d)] : [] })
  if (status === 'failed') r.status = 'failed'
}
const fileOf = d => results.get(d.file) || [...results.values()][0]
const msg = d => String(d.details?.error?.cause?.stack || d.details?.error?.cause || d.details?.error?.message || d.details?.error || '')
on['test:pass'] = d => done(d, d.skip || d.todo ? 'pending' : 'passed')
on['test:fail'] = d => done(d, 'failed')
on['test:stdout'] = d => process.stdout.write(d.message)
on['test:stderr'] = d => process.stderr.write(d.message)
on['test:diagnostic'] = d => console.log('#', d.message)
stream.on('end', () => {
  const testResults = [...results.values()]
  for (const r of testResults) if (!r.assertionResults.length && r.message) r.status = 'failed'
  const all = testResults.flatMap(r => r.assertionResults)
  const count = s => all.filter(t => t.status === s).length
  const report = { runner: 'node:test', numTotalTests: all.length, numPassedTests: count('passed'), numFailedTests: count('failed'), numPendingTests: count('pending'), success: !count('failed') && testResults.every(r => r.status === 'passed'), testResults }
  for (const t of all) console.log(`${t.status === 'passed' ? '✓' : t.status === 'pending' ? '-' : '✗'} ${t.fullName}${t.failureMessages[0] ? '\n    ' + t.failureMessages[0].split('\n').slice(0, 6).join('\n    ') : ''}`)
  console.log(`${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numPendingTests} skipped, ${report.numTotalTests} total`)
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2))
  process.exitCode = report.success && all.length ? 0 : 1
})
