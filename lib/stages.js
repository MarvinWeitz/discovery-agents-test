// The stages of a discovery run: one list that says what runs when, what each stage reads and writes,
// whether it uses AI, and which switch turns it off. bin/pipeline.js runs the "pipeline" stages in this
// order and records each one in <out>/manifest.json; bin/stages.js renders this list as docs/stages.md,
// so the documentation cannot drift from the code.
//
// when      pipeline   bin/pipeline.js runs it (locally or in CI), no app install needed
//           ci         needs the app installed and running: `cap-discovery test|all` (bin/cap-discovery.js), run by
//                      the GitHub Action (action.yml), the Run discovery workflow, or a person in the project
//           on-demand  a command a person (or a workflow) runs after the pipeline
//           by-hand    work done by an AI agent or a person, outside this repository's code
// method    static     reads files and asks CAP's compiler, never runs the app, never calls an LLM
//           measured   the running app answered (cds.test in CI)
//           ai         an LLM wrote it; only enters the findings through the evidence gate
// switch    what turns the stage off: "mode" (discovery.config.json "mode" or --mode), a key under
//           "stages", or an addon under "addons"; null = always on
// Walkthrough: docs/walkthrough/13-findings-and-gaps.md · Generated table: docs/stages.md

const STAGES = [
  {
    id: 'intake', title: 'Get the app', when: 'ci', method: 'static', switch: null, piece: '01',
    code: ['.github/workflows/discover.yml', 'bin/cap-discovery.js', 'lib/project/detect.js', 'lib/runtime/test-run.js'],
    does: 'Clone the repository (central mode) or use the checkout it runs in (portable mode), find the CAP app and its UI5 projects, install its packages, repair what blocks a test start.',
    in: ['repository URL, ref, optional app folder and UI folders'],
    out: ['the app checkout with node_modules'],
  },
  {
    id: 'discover', title: 'Ask CAP, extract, analyse', when: 'pipeline', method: 'static', switch: null, piece: '02-06',
    code: ['bin/discover.js', 'lib/project/', 'lib/extract/', 'lib/analyse/slices.js', 'lib/analyse/classes.js'],
    does: 'Ask CAP how it sees the project (config per profile, model files, services, implementations, seed data), compile the model once, parse handlers, UI5 apps, config, tests, CDS layers, HANA artifacts, lint, git history; cut and rank slices.',
    in: ['app folder', '--ui folders'],
    out: ['run/project.json', 'run/csn.json', 'run/edmx/', 'run/graph/nodes.jsonl', 'run/graph/edges.jsonl', 'run/slices/catalog.json', 'run/tests/class-seeds.json', 'run/metrics.json', 'run/discovery-report.md'],
  },
  {
    id: 'facts', title: 'Analyse into atlas facts', when: 'pipeline', method: 'static', switch: null, piece: '07-09, 11',
    code: ['bin/atlas-facts.js', 'lib/atlas/', 'lib/analyse/', 'addons/*/index.js facts()'],
    does: 'Authorization matrix, test design, patterns, risks, every atlas section; addons add theirs. A curated base adds reviewed agent risks.',
    in: ['run/', 'curated/<app>.json (optional)'],
    out: ['atlas-data.json', 'run/measured/plan.json', 'pr/*.md'],
  },
  {
    id: 'findings', title: 'Findings and gaps (the middle layer)', when: 'pipeline', method: 'static', switch: 'stages.findings', piece: '13',
    code: ['bin/findings.js', 'lib/findings/', 'addons/*/index.js findings()'],
    does: 'Every judgement of the run as one finding with evidence, method and status; every question static analysis could not settle as a gap, with who can settle it (measured, ai, human). Both validated against JSON Schemas.',
    in: ['run/graph/', 'run/csn.json', 'run/project.json', 'run/metrics.json', 'atlas-data.json', 'run/findings/ai.jsonl (mode static+ai)'],
    out: ['run/findings/findings.jsonl', 'run/findings/gaps.jsonl', 'run/findings/summary.json', 'run/findings/README.md', 'pr/findings.md'],
    schemas: ['schema/finding.schema.json', 'schema/gap.schema.json'],
  },
  {
    id: 'tests', title: 'Generate tests', when: 'pipeline', method: 'static', switch: null, piece: '10',
    code: ['bin/gen-tests.js'],
    does: 'Write cds.test suites from the equivalence classes: today: tests pin current behaviour, spec: tests (skipped) state the intended one.',
    in: ['run/'],
    out: ['run/tests/generated/*.test.js', 'run/tests/generated/manifest.json'],
  },
  {
    id: 'atlas', title: 'Render the atlas', when: 'pipeline', method: 'static', switch: null, piece: '11',
    code: ['bin/atlas.js', 'addons/*/view.js'],
    does: 'Markdown topics with PNG images and the interactive HTML page, from atlas-data.json only.',
    in: ['atlas-data.json'],
    out: ['atlas/README.md', 'atlas/topics/*.md', 'atlas/images/*.png', 'atlas/index.html'],
  },
  {
    id: 'ai-requests', title: 'Prepare AI requests', when: 'pipeline', method: 'static', switch: 'mode', piece: '12, 13',
    code: ['bin/ai-requests.js'],
    does: 'One request file per open gap an AI can work on: the question, what static analysis already knows, the files to read, and the exact answer format. No LLM is called.',
    in: ['run/findings/gaps.jsonl', 'run/findings/findings.jsonl', 'run/graph/'],
    out: ['run/ai/requests/<gap>.md', 'run/ai/requests/index.json', 'run/ai/README.md'],
    schemas: ['schema/ai-answer.schema.json'],
  },
  {
    id: 'validate', title: 'Validate the run', when: 'pipeline', method: 'static', switch: null, piece: '13',
    code: ['bin/validate.js'],
    does: 'Check every findings, gaps, AI answer and manifest file against its schema, and that ids, graph references and evidence files exist. A failed check fails the pipeline.',
    in: ['manifest.json', 'run/findings/', 'run/ai/answers/', 'run/graph/'],
    out: ['exit code, problems on stderr'],
  },
  {
    id: 'run-tests', title: 'Run the app and its tests', when: 'ci', method: 'measured', switch: 'addons.measured, addons.runtime', piece: '10',
    code: ['lib/runtime/test-run.js', 'lib/runtime/node-test.js', 'lib/runtime/repair-install.js'],
    does: 'Start the app under cds.test (records registered handlers), run the generated tests, send the authorization probe, log requests, collect coverage.',
    in: ['run/tests/generated/', 'run/measured/plan.json', 'the installed app'],
    out: ['jest-generated.json', 'run/runtime.json', 'run/measured/authz.json', 'run/measured/requests*.jsonl', 'run/measured/coverage-*/'],
  },
  {
    id: 'after-tests', title: 'Fold in what the running app answered', when: 'ci', method: 'measured', switch: null, piece: '11, 13',
    code: ['bin/after-tests.js', 'addons/*/index.js afterTests()'],
    does: 'Addons compare measured results with the static facts and update the atlas; the findings stage runs again, so measured findings settle the gaps they answer.',
    in: ['jest-generated.json', 'run/runtime.json', 'run/measured/'],
    out: ['atlas-data.json', 'atlas/', 'run/findings/', 'manifest.json'],
  },
  {
    id: 'ai-answer', title: 'Answer the requests', when: 'by-hand', method: 'ai', switch: 'mode', piece: '12',
    code: ['agents/gap-resolver.md', 'skills/cap-discovery'],
    does: 'An AI agent (Claude Code) reads each request and the app source and writes one answer per gap: findings with file:line and a verbatim quote, or "unknown".',
    in: ['run/ai/requests/', 'the app source'],
    out: ['run/ai/answers/<gap>.json'],
    schemas: ['schema/ai-answer.schema.json'],
  },
  {
    id: 'ai-merge', title: 'Gate and merge AI answers', when: 'on-demand', method: 'static', switch: 'mode', piece: '12, 13',
    code: ['bin/ai-merge.js', 'lib/evidence.js'],
    does: 'Accept an AI finding only when its file:line exists and its quote is there; rejected ones go to the log. Accepted ones become findings with method ai, and the findings stage marks their gaps answered.',
    in: ['run/ai/answers/*.json', 'the app source'],
    out: ['run/findings/ai.jsonl', 'run/ai/merge-log.json', 'run/findings/ (rebuilt)'],
  },
]

const MODES = {
  static: 'Static analysis only. No AI request files, AI answers are ignored even when present. Complete and valid on its own.',
  'static+ai': 'Static analysis, plus AI request files for the open gaps, plus the AI answers that passed the evidence gate (method "ai" in the findings).',
}

// toolkit defaults plus the project's own discovery.config.json (lib/config.js)
const { config } = require('./config')

// --mode beats DISCOVERY_MODE beats discovery.config.json "mode"; default static
function mode(cli) {
  const m = cli || process.env.DISCOVERY_MODE || config().mode || 'static'
  if (!MODES[m]) throw new Error(`unknown mode "${m}"; use ${Object.keys(MODES).join(' or ')}`)
  return m
}

// a stage switch: "stages": { "findings": false } turns a stage off; DISCOVERY_STAGES_OFF=findings for one run
function stageOn(id) {
  const off = String(process.env.DISCOVERY_STAGES_OFF || '').split(',').map(s => s.trim())
  if (off.includes(id)) return false
  return config().stages?.[id] !== false
}

const byId = id => STAGES.find(s => s.id === id)

module.exports = { STAGES, MODES, mode, stageOn, byId, config }
