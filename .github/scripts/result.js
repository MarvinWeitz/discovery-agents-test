// Collects one discovery run into <out>/result.json (read by summary.js and pages-index.js).
//   node result.js <out> <app-dir>      run facts come from RUN_* environment variables
const fs = require('fs')
const path = require('path')
const [out, appDir] = process.argv.slice(2)
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')) } catch { return null } }
const e = process.env

const atlas = read(`${appDir}/atlas-data.json`)
const jest = read('jest-generated.json')
let startup = e.RUN_STARTUP || 'not run'
if (startup === 'failed') {
  // first meaningful line of the startup test's failure
  const j = read('jest-startup.json')
  const msg = j?.testResults?.flatMap(s => [s.message, ...s.assertionResults.flatMap(t => t.failureMessages || [])]).find(Boolean) || ''
  startup = 'failed: ' + (msg.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map(s => s.trim()).find(s => s && !/^●/.test(s)) || 'see the job log').slice(0, 200)
}

const r = {
  repo: e.RUN_REPO,
  slug: e.RUN_SLUG,
  ref: e.RUN_REF || '',
  commit: e.RUN_COMMIT,
  app: e.RUN_APP,
  ui: e.RUN_UI || '',
  visibility: e.RUN_VISIBILITY,
  publish: e.RUN_PUBLISH,
  atlas_url: e.RUN_PUBLISH === 'pages' ? e.RUN_ATLAS_URL : '',
  publish_note: e.RUN_PUBLISH === 'pages' ? '' : e.RUN_PUBLISH_NOTE || 'not published; download the bundle from the run',
  run_url: e.RUN_URL,
  date: new Date().toISOString().slice(0, 16) + 'Z',
  title: atlas?.META?.title || e.RUN_SLUG,
  curated: Boolean(e.RUN_CURATED),
  atlas: Boolean(atlas),
  kpis: (atlas?.KPIS || []).map(([v, l]) => ({ label: l, value: v })),
  startup,
  tests: jest ? { passed: jest.numPassedTests, failed: jest.numFailedTests, skipped: jest.numPendingTests, total: jest.numTotalTests } : null
}
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(r, null, 1))
console.log(`tests=${r.tests ? `${r.tests.passed} passed, ${r.tests.failed} failed, ${r.tests.skipped} skipped` : 'not run'}`)
