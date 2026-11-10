// Reads what the earlier stages wrote into <out>, once, for every step product.
// Every loader returns null (or []) when its file is missing, so a product can say "not in this run"
// instead of failing: the static pipeline has no test results, a CI run has them.
const fs = require('fs')
const path = require('path')

function ctx(out, opts = {}) {
  const run = path.join(out, 'run')
  const P = (...p) => path.join(out, ...p)
  const exists = f => fs.existsSync(f)
  const json = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
  const jsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }
  const memo = {}
  const once = (k, fn) => (k in memo ? memo[k] : (memo[k] = fn()))
  const C = {
    out, run, P, exists, json, jsonl, opts, once,
    manifest: () => once('manifest', () => json(P('manifest.json'))),
    facts: () => once('facts', () => json(P('atlas-data.json')) || {}),
    project: () => once('project', () => json(path.join(run, 'project.json'))),
    metrics: () => once('metrics', () => json(path.join(run, 'metrics.json'))),
    csn: () => once('csn', () => json(path.join(run, 'csn.json'))),
    nodes: () => once('nodes', () => jsonl(path.join(run, 'graph', 'nodes.jsonl'))),
    edges: () => once('edges', () => jsonl(path.join(run, 'graph', 'edges.jsonl'))),
    findings: () => once('findings', () => jsonl(path.join(run, 'findings', 'findings.jsonl'))),
    gaps: () => once('gaps', () => jsonl(path.join(run, 'findings', 'gaps.jsonl'))),
    findingsSummary: () => once('fsum', () => json(path.join(run, 'findings', 'summary.json'))),
    classSeeds: () => once('seeds', () => json(path.join(run, 'tests', 'class-seeds.json')) || []),
    generatedManifest: () => once('genman', () => json(path.join(run, 'tests', 'generated', 'manifest.json'))),
    // Jest --json results: given on the command line (CI), or next to the out dir as the workflows write them
    jest: () => once('jest', () => json(opts.generated || '') || json(path.join(out, '..', 'jest-generated.json')) || json(P('jest-generated.json'))),
    // the app checkout, for git history; null when the out dir was moved away from it
    root: () => once('root', () => { const r = C.manifest()?.app?.root; return r && exists(r) ? r : null }),
  }
  C.byId = () => once('byId', () => new Map(C.nodes().map(n => [n.id, n])))
  return C
}

module.exports = { ctx }
