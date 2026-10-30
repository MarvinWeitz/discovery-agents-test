# Addons

Optional modules on top of the discovery pipeline. Each one lives in its own folder under `addons/`, has its own switch in `discovery.config.json`, and can be removed without touching the others.

```json
{ "addons": { "coverage": true, "diff": true, "mutation": true, "docs": true, "rules": true } }
```

| Want to | Do |
| --- | --- |
| Turn an addon off | set it to `false` in `discovery.config.json` |
| Turn it off for one run | `DISCOVERY_ADDONS_OFF=coverage,docs node bin/pipeline.js …` |
| Remove it for good | delete `addons/<name>/` (and its workflow, if it has one; listed below) |
| Check from a workflow | `node bin/addon.js enabled <name>` exits 0 when on |

The core calls addons at three hooks only (`lib/addons.js` documents them): `facts` in `bin/atlas-facts.js`, `afterTests` in `bin/after-tests.js` (CI, after Jest ran), and `topics` / `views` in `bin/atlas.js` (Markdown and HTML for an addon's atlas section). With every addon off, the pipeline's output is the same as before addons existed.

Shared, addon-neutral helpers the core now writes: a `dim` (entity, operation, state) and `fact` (graph node) on every equivalence class, and `run/tests/generated/manifest.json` mapping each generated test title to its class.

## coverage: coverage by equivalence class

Line coverage says which code ran. This says which business cases are tested: every equivalence class (entity · operation × state, user group, guard branch) is matched to the tests that exercise it.

- **Sources**, strongest first: a generated cds.test built for that class (via `manifest.json` and the Jest results), a request in an existing test to the same entity and operation as a user of the class (parsed from the test file), a test name that mentions it (approximate).
- **Statuses**: tested · generated, not run yet · spec only (today's behaviour pinned, the intended one waits as `it.skip`) · likely (approximate) · test fails · untested.
- **Outputs**: atlas section `COV` with a heatmap (entity · operation × state, click a cell for its classes and tests), status bars per category and a ranked "test next" list; `topics/NN-cov-coverage-by-class.md`; `coverage.md` (summary, also in the job summary and the PR comment); KPI "classes tested".
- **Files**: `addons/coverage/` (`coverage.js` logic, `index.js` hooks, `view.js` atlas views). CI step: "Addons after tests" in `.github/workflows/sflight.yml`.

## diff: diff mode as a PR check

Runs the pipeline on the base and the head of a PR and posts what changed as **one sticky PR comment** (updated on every push, marker `discovery:diff`):

- 🔴 new risks (rule or agent), ✅ resolved ones, changed scores
- 🟠 pattern breaks: a coding pattern that is new and unhealthy, or got worse (idiomatic → wrong place → defect)
- 🟡 equivalence classes that lost their test (status from the coverage addon when on; otherwise from the test design)
- 🔓 authorization cells that changed, bold when they became open without a role
- UI-vs-server verdict changes, new classes without a test, changed KPIs
- **Changed nodes graph** as a Mermaid block (GitHub renders it): green added, red removed, amber changed, grey one ring of context

Nodes whose id carries a line number (rules, handlers) are matched by content, so inserting a line above a rule is not reported as a change.

- **In this repo** a PR changes the toolkit, so `discovery-diff.yml` runs the base and the head toolkit on the same SFlight commit ("what this PR changes in the findings"). A collapsed **Demo** section also applies `addons/diff/demo/sflight-risky-change.patch` (opens a PII projection, widens a grant, deletes a guard) to show what an app PR gets.
- **In an app repo**: check out the app at base and head, then `addons/diff/run.sh <toolkit> <app-base> out/base`, the same for head, and `node addons/diff/cli.js out/base out/head out/report`. `--fail-on-new` makes it a blocking check.
- **Files**: `addons/diff/` (`diff.js` compare, `report.js` Markdown + Mermaid, `cli.js`, `run.sh`, `demo/`), `.github/workflows/discovery-diff.yml`, `.github/scripts/sticky-comment.sh` (shared).
