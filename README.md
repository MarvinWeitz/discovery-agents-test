# cap-discovery-toolkit

Discovers a CAP Node.js + UI5 app end to end and writes an atlas: architecture, data model, CDS dependencies, data flow and events, status machine, authorization, coding patterns, UI promises vs server, risks, test design and interfaces. Every fact carries `file:line` evidence. Strategy: map wide with fixed tools, slice deep with agents, converge into one fact file.

See [OVERVIEW.md](OVERVIEW.md) for the process (which steps are deterministic, which are agentic), the catalogue of reused and self-built parts, and the licence report.

## Run

```sh
npm install --ignore-scripts
node bin/pipeline.js <app-root> <out-dir> [--ui ../ui-a,../ui-b] [--base curated/<app>.json]
```

| Step | Script | Writes |
| --- | --- | --- |
| 1 discover | `bin/discover.js <app-root> <out>/run [--ui dirs]` | knowledge graph `graph/*.jsonl`, `metrics.json`, `slices/catalog.json`, `discovery-report.md` |
| 2 facts | `bin/atlas-facts.js <out>/run <out>/atlas-data.json [--base curated.json]` | every atlas section, generated from the graph; agent risks merged from the curated file |
| 3 tests | `bin/gen-tests.js <out>/run` | `run/tests/generated/*.test.js` (cds.test, syntax-checked) |
| 4 atlas | `bin/atlas.js <out>/atlas-data.json <out>/atlas` | `README.md`, `topics/*.md`, `images/*.png`, `index.html` |

The app needs no `npm install`; the toolkit compiles the model with its own `@sap/cds`. If the app imports `@sap/cds/common`, make the toolkit's `node_modules` resolvable from the app (for example a symlink named `node_modules` in the app's parent folder). The toolkit never runs the app or its tests.

## CI on a public sample

`.github/workflows/sflight.yml` checks out `SAP-samples/cap-sflight` at a pinned commit, installs it the way its own CI does, runs `bin/pipeline.js` on it, then copies the generated cds.test files into the app and runs them with the app's Jest. The job summary lists every generated test with its result; the atlas, the run and the Jest reports are uploaded as the `sflight-discovery` artifact. SFlight's own `test/odata.test.ts` runs too, as a baseline.

## Agentic deep dive

```sh
node bin/brief.js   <out>/run <app-root> <slice-id>   # slice brief for the agents
# agents/: flow-tracer, behaviour-analyst, event-integration-analyst, risk-reviewer, test-reviewer
node bin/merge.js   <out>/run <app-root> <slice-id>   # accepts only facts whose quote is on the cited line
node bin/dossier.js <out>/run <slice-id>              # slice dossier
```

`risk-reviewer` writes `curated/<app>.json`; rerun the pipeline with `--base` to merge. The agents use Claude Code subagent frontmatter (copy to `.claude/agents/`). The skills in `skills/` describe the whole workflow (`cap-discovery`) and how to use an atlas (`cap-atlas-reader`).

## What is generated

| Module | From | Produces |
| --- | --- | --- |
| `extract-model.js` | CDS compiler (CSN with locations) | services, entities, projections, associations, compositions, constraints, actions, `@requires` / `@restrict` grants incl. `where` |
| `extract-handlers-ast.js` | TypeScript compiler API on `srv/**/*.js|ts` | handler registrations, helpers, rejections with guard and HTTP status, derivations, CQL reads and writes with where and set, `next()` |
| `reflexion-ui.js` | UI annotations vs handlers | `UiRule` verdicts: enforced, consistent, framework, partial, stricter, ui-only |
| `extract-app.js` | manifests, `package.json`, `.cdsrc.json`, `xs-security.json`, tests, git | UI5 apps and routes, mock users (merged with CAP defaults), roles, tests and the users they run as, churn |
| `extract-cds-deps.js` | CDS sources | file dependencies (`using`, `annotate`, `extend`) with layer verdicts |
| `extract-lint.js` | `@sap/eslint-plugin-cds`, `@ui5/linter` | findings |
| `authz.js` | graph | user × operation matrix incl. draft inheritance and row-level filters |
| `test-design.js` | graph + CSV seed data | 7 test categories, seeded all-pairs (PICT-style), concrete requests |
| `patterns.js` | CSN + graph + sources | 32 fixed pattern detectors with health |
| `risks.js` | graph | 10 risk rules with impact, likelihood, evidence and the test that catches each |
| `atlas-facts.js` | all of the above | the atlas fact file |

Licences of every tool are tracked in [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

## Known limits

- Coverage of existing tests is matched by user, entity and test name, so it is approximate.
- Business criticality in the slice risk score is a placeholder (0.5).
- Runtime behaviour (row-level filters during draft activation, anonymous access behind an approuter) is marked "verify" until a request confirms it.
