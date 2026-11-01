# cap-discovery-toolkit

Discovers a CAP Node.js + UI5 app end to end and writes an atlas: architecture, data model, CDS dependencies, data flow and events, status machine, authorization, coding patterns, UI promises vs server, risks, test design and interfaces. Every fact carries `file:line` evidence. Strategy: map wide with fixed tools, slice deep with agents, converge into one fact file.

See [OVERVIEW.md](OVERVIEW.md) for the process (which steps are deterministic, which are agentic), the catalogue of reused and self-built parts, and the licence report.

## Run

```sh
npm install --ignore-scripts
node bin/pipeline.js <app-root> <out-dir> [--ui ../ui-a,../ui-b] [--base curated/<app>.json] [--mode static|static+ai]
node bin/stages.js show <out-dir>      # what ran, how long, what each stage wrote (from <out-dir>/manifest.json)
```

What runs when, with every input and output: [docs/stages.md](docs/stages.md) (generated from `lib/stages.js`).

**Modes.** `static` (default) uses no AI anywhere and is complete on its own. Its machine-readable middle layer is `run/findings/findings.jsonl` (every judgement with evidence, method and status) and `run/findings/gaps.jsonl` (every question static analysis could not settle, with who can: a measurement, an AI, a person), each with a JSON Schema in `schema/`, checked by `bin/validate.js` at the end of every run. `static+ai` also writes one request per open gap to `run/ai/requests/`; an AI agent answers them later (`agents/gap-resolver.md`), and `bin/ai-merge.js` lets in only findings whose quote is on the cited line. Details: [docs/walkthrough/13-findings-and-gaps.md](docs/walkthrough/13-findings-and-gaps.md).

| Step | Script | Writes |
| --- | --- | --- |
| 1 discover | `bin/discover.js <app-root> <out>/run [--ui dirs]` | knowledge graph `graph/*.jsonl`, `metrics.json`, `slices/catalog.json`, `discovery-report.md` |
| 2 facts | `bin/atlas-facts.js <out>/run <out>/atlas-data.json [--base curated.json]` | every atlas section, generated from the graph; agent risks merged from the curated file |
| 2b findings | `bin/findings.js <out> [--mode m]` | `run/findings/findings.jsonl`, `gaps.jsonl`, `summary.json`, `README.md` (the middle layer; addons add measured findings after the tests) |
| 3 tests | `bin/gen-tests.js <out>/run` | `run/tests/generated/*.test.js` (cds.test, syntax-checked) |
| 5 ai-requests | `bin/ai-requests.js <out>` (mode `static+ai`) | `run/ai/requests/<gap>.md`, `index.json`, `run/ai/README.md` |
| 6 validate | `bin/validate.js <out>` | nothing; fails the run when a schema or a link between findings, gaps, graph and code does not hold |
| later | `bin/ai-merge.js <out>` | gates `run/ai/answers/*.json` into `run/findings/ai.jsonl`, rebuilds the findings in mode `static+ai`, validates |
| 4 atlas | `bin/atlas.js <out>/atlas-data.json <out>/atlas` | `README.md`, `topics/*.md`, `images/*.png`, `index.html` (one page per section with a sidebar, or one long page: `"atlas": { "layout" }` in `discovery.config.json`; ranked next steps with copyable AI prompts from the `nextsteps` addon, see [ADDONS.md](ADDONS.md)) |

The app needs no `npm install`; the toolkit compiles the model with its own `@sap/cds`. If the app imports `@sap/cds/common`, make the toolkit's `node_modules` resolvable from the app (for example a symlink named `node_modules` in the app's parent folder). The toolkit never runs the app or its tests.

## Inside your own project (portable mode)

Run it in the project itself instead of from this repo: a GitHub Action step in the project's CI (`uses: <org>/<toolkit-repo>@main`), or the `cap-discovery` CLI (installed from the toolkit's git URL) with `run|all|docs` in any checkout, plus a Claude Code plugin for the AI pass. Private code never leaves the project, and the toolkit itself can live in a private GitHub Enterprise repo. `npx … init` writes the workflow, a `discovery.config.json` (merged over the defaults here) and the Claude Code settings. Everything about it: [PORTABLE.md](PORTABLE.md); the files a project commits: [examples/consumer/](examples/consumer/).

## CI on a public sample

`.github/workflows/sflight.yml` checks out `SAP-samples/cap-sflight` at a pinned commit, installs it the way its own CI does, runs `bin/pipeline.js` on it, then copies the generated cds.test files into the app and runs them with the app's Jest. With the `uitests` addon it also runs generated OPA5 UI tests for the UI promises in SFlight's Fiori app (headless Chromium, see [ADDONS.md](ADDONS.md)). The job summary lists every generated test with its result; the atlas, the run and the Jest reports are uploaded as the `sflight-discovery` artifact. SFlight's own `test/odata.test.ts` runs too, as a baseline.

## Run discovery on any repo

`.github/workflows/discover.yml` ("Run discovery" in the Actions tab) takes a repo URL, and optionally a branch, the CAP app folder and UI5 folders (all detected when empty). It clones the repo, installs it, runs `bin/pipeline.js`, starts the app under cds.test (in-memory SQLite) and runs the generated tests; if the app does not start under Jest it retries with Node's own test runner (`.github/scripts/node-test.js`, same tests, Jest-format report), apps that only configure token auth (xsuaa, ias, jwt) are tested with CAP's mocked users, and if the app still does not start (for example it needs HANA), the runtime tests are skipped and the atlas is still built. The atlas goes to GitHub Pages at `<pages>/<owner>-<repo>/` (HTML plus the Markdown files, generated tests, Jest reports and the test-backed docs from `bin/after-tests.js`), with an index of every app at the Pages root (`index.html`, `index.md`, `runs.json`). The whole output is also kept as the run's `discovery-<slug>` artifact. If `curated/*.json` has a file whose `META.app` names the repo, its agent findings are merged.

Pages has to be switched on once: Settings → Pages → Source: Deploy from a branch → `gh-pages` / root.

Private repos: add a `DISCOVERY_REPO_TOKEN` secret (fine-grained, Contents: read on the target). Private targets are never published to Pages, and the workflow refuses them while this repo is public, because the logs and artifacts of a public repo are public.

On pull requests the workflow runs on the pilot apps as a check and builds the Pages site as the `pages-preview` artifact without publishing. Pilots, all gating: incidents-app, ui5-cap-event-app, cap-sflight, HANA CodeJam (calc view, procedure, xsuaa), capire/samples bookstore (reuse services, events, workspace with submodules) and Poetry Slam Manager (split handlers, S/4HANA, ByD and B1 APIs, HANA sequence). A pilot that should only report gets `"gate": false` in `PILOTS`. What each of them taught the extractors: [PILOTS.md](PILOTS.md).

## Agentic deep dive

Gap pass (answers only what static analysis left open): `node bin/pipeline.js … --mode static+ai`, run `agents/gap-resolver.md` on each `run/ai/requests/<gap>.md`, then `node bin/ai-merge.js <out>`.

Slice pass (a whole feature, 10 fixed questions):

```sh
node bin/brief.js   <out>/run <app-root> <slice-id>   # slice brief for the agents
# agents/: flow-tracer, behaviour-analyst, event-integration-analyst, risk-reviewer, test-reviewer
node bin/merge.js   <out>/run <app-root> <slice-id>   # accepts only facts whose quote is on the cited line
node bin/dossier.js <out>/run <slice-id>              # slice dossier
```

`risk-reviewer` writes `curated/<app>.json`; rerun the pipeline with `--base` to merge. The agents use Claude Code subagent frontmatter (copy to `.claude/agents/`). The skills in `skills/` describe the whole workflow (`cap-discovery`) and how to use an atlas (`cap-atlas-reader`).

## What is generated

Code is grouped by task. Each step has a walkthrough in [docs/walkthrough/](docs/walkthrough/README.md) with every decision and every hard-coded assumption; [00-assumptions.md](docs/walkthrough/00-assumptions.md) lists them all in one table.

| Folder / module | From | Produces |
| --- | --- | --- |
| `lib/project/` (`layout`, `config`, `files`, `sources`, `detect`) | the app's own CAP config (`cds.env`) | where things are: db/srv/app folders, config files, seed data, HDI sources, ignored folders; the app folder in a cloned repo. Every folder assumption lives here |
| `lib/extract/model.js` | CDS compiler (CSN with locations) | services, entities, projections, associations, compositions, constraints, actions, `@requires` / `@restrict` grants incl. `where` |
| `lib/extract/handlers/` | TypeScript compiler API on the srv folder (`*.js|ts`) | `binding` (which service a file implements, split implementations), `names` (constants, `cds.connect.to`, aliases), `registrations` (before/on/after), `body` (rejections with guard and HTTP status, derivations, CQL reads and writes, events, remote calls, native SQL, helpers), `file-scan` (remote calls, native SQL, database branches); the CAP words it knows are in `vocabulary.js` |
| `lib/extract/native.js` | HDI artifacts, `package.json` | calculation views, procedures, sequences linked to `@cds.persistence.exists` entities, to the tables they read and to the code that calls them; database model per profile |
| `lib/extract/ui5.js`, `config.js`, `auth.js`, `tests.js`, `history.js` | manifests, `package.json`, `.cdsrc.json`, `xs-security.json`, tests, git | UI5 apps and routes, remote services and brokers, mock users (merged with CAP defaults), roles, tests and the users they run as, churn |
| `lib/extract/cds-deps.js` | CDS sources | file dependencies (`using`, `annotate`, `extend`) with layer verdicts |
| `lib/extract/lint.js` | `@sap/eslint-plugin-cds`, `@ui5/linter` | findings |
| `lib/extract/bootstrap.js`, `lib/project/plugins.js` | `server.js`, `cds-plugin.js` of local plugin packages | express routes added at bootstrap (`HttpRoute`), local plugin code (`PluginFile`) |
| `lib/findings/`, `lib/stages.js`, `lib/manifest.js`, `lib/schema.js` | everything above | the middle layer (findings, gaps), the stage list, the run manifest, schema checks |
| `lib/analyse/reflexion-ui.js` | UI annotations vs handlers | `UiRule` verdicts: enforced, consistent, framework, partial, stricter, ui-only |
| `lib/analyse/slices.js`, `classes.js` | graph | vertical slices ranked by risk; equivalence-class seeds |
| `lib/analyse/authz.js` | graph | user × operation matrix incl. draft inheritance and row-level filters |
| `lib/analyse/test-design.js` | graph + CSV seed data | 7 test categories, seeded all-pairs (PICT-style), concrete requests |
| `lib/analyse/patterns.js` | CSN + graph + sources | 43 fixed pattern detectors with health |
| `lib/analyse/risks.js` | graph | 16 risk rules with impact, likelihood, evidence and the test that catches each (incl. HANA-only paths, native SQL, database branches, model per profile, remote systems without a test double, untested event subscriptions) |
| `lib/atlas/` (`index.js`, `sections/<code>.js`) | all of the above | the atlas fact file, one builder per section |
| `lib/report/` | graph | the Markdown discovery report and its rendered Mermaid diagrams |

Licences of every tool are tracked in [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

## Known limits

- Coverage of existing tests is matched by user, entity and test name, so it is approximate.
- Business criticality in the slice risk score is a placeholder (0.5).
- Runtime behaviour (row-level filters during draft activation, anonymous access behind an approuter) is marked "verify" until a request confirms it.
