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
- **Outputs**: atlas section `COV` with a heatmap (entity · operation × state, click a cell for its classes and tests), status bars per category and a ranked "test next" list; `topics/NN-cov-coverage-by-class.md`; `pr/coverage.md` (summary for the job summary and the PR comment; every addon puts its PR snippet in `<out>/pr/`); KPI "classes tested".
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

## mutation: mutation testing as the quality score

Passing tests only prove that tests exist. Stryker (Apache-2.0) makes small changes to the app's handler code (flips `>` to `>=`, empties a block with a `req.reject`, swaps a string) and reruns the generated and existing tests. A mutant no test notices "survived".

- **Outputs**: mutation score per app (and per file), score per equivalence class (mutants reached by the class's generated tests vs killed by them, via `manifest.json`), survivors tied to the rule or handler they sit in ("emptying this block in rejection … has been approved already"), atlas section `MUT` (survivor cards, class bars), `mutation.md`, `mutation-summary.json`, KPI "mutation score".
- **When**: nightly at 02:30 UTC and on demand (`.github/workflows/mutation.yml`); also on PRs that change `addons/mutation/`. Runs take minutes to an hour, so not on every push.
- **Files**: `addons/mutation/` (`stryker.config.json` copied into the app, `mutation.js` analysis, `cli.js`, `view.js`), `.github/workflows/mutation.yml`.

## docs: documentation only from test-backed facts

Every documentation statement is generated from one equivalence class and the graph fact behind it (a grant, a UI promise, a status transition, a rejection or derivation in a handler), and shows what backs it:

- ✅ **verified**: a generated test for exactly this class passed in CI (numbered `T-n` in the order of `manifest.json`)
- ◐ **exercised**: an existing test sends this request, but its assertions are not tied to the statement
- ⬜ **unverified**: no test yet ❌ **broken**: its test fails

When today's behaviour differs from the intended one (for example the server accepts an action the UI hides), the statement says so and names the waiting spec test. If behaviour changes, the test fails and the statement loses its ✅.

- **Outputs**: `<out>/docs/README.md` (index, counts per feature) and one file per feature slice with three levels: **For business** (confirmed behaviour in plain words), **For developers** (mechanism and `file:line`), **For testers** (class, test, status, gaps); `pr/docs.md`; KPI "doc statements verified". The pipeline writes them without results (all unverified); `bin/after-tests.js` rewrites them with the CI results.
- **Files**: `addons/docs/` (`docs.js` sentences, backing and Markdown, `index.js` hooks). Uses the coverage addon's request matches when it is on; works without it.

## rules: agent findings promoted into rules

When an agent finds something no rule sees, it also drafts a deterministic rule that would find it, plus a unit test. Rules are reviewed and accepted like code, so the paid, slow AI part shrinks while the free, repeatable part grows.

- **Library**: `addons/rules/library/<key>.js` + `<key>.test.js`. A rule exports `{ key, title, status, from, i, l, lay, test, detect(ctx) }`; `ctx` has the app's sources, the knowledge graph and the CSN.
- **Status**: `draft` rules only report (atlas section `RLS`, `pr/rules.md`), next to the agent finding they reproduce (same file, ±2 lines). Changing a rule to `accepted` in a reviewed PR makes its hits atlas risks and retires the agent finding automatically.
- **First five drafts** (by the `rule-drafter` agent, `agents/rule-drafter.md`), all reproduce their source finding:

| Rule | From | Fires on |
| --- | --- | --- |
| `null-deref-in-guard` | SFlight A7 (404 path crashes) | `srv/travel-service.ts:105` |
| `max-plus-one-id` | SFlight A8 (max + 1 race) | `srv/travel-service.ts:18` |
| `hard-coded-currency` | SFlight A12 (USD in analytics) | `srv/analytics-service.cds:24` |
| `commented-out-grant` | event app A2 (UPDATE grant behind FIXME) | event app `srv/eventregistration-service.cds:12`; also SFlight's commented-out `@restrict` (A3) |
| `writable-owner-field` | event app A1 (Email decides ownership, writable) | event app `srv/eventregistration-service.cds:4` |

- **Tests**: `node --test 'addons/rules/library/*.test.js'` (14 tests: the finding, a variant, near misses), in `.github/workflows/rules.yml`.
- **Files**: `addons/rules/` (`engine.js`, `index.js`, `view.js`, `library/`), `agents/rule-drafter.md`, `.github/workflows/rules.yml`.
