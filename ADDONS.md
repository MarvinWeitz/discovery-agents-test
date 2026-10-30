# Addons

Optional modules on top of the discovery pipeline. Each one lives in its own folder under `addons/`, has its own switch in `discovery.config.json`, and can be removed without touching the others.

```json
{ "addons": { "coverage": true, "diff": true, "mutation": true, "docs": true, "rules": true, "nextsteps": true, "uitests": true }, "atlas": { "layout": "pages" } }
```

| Want to | Do |
| --- | --- |
| Turn an addon off | set it to `false` in `discovery.config.json` |
| Turn it off for one run | `DISCOVERY_ADDONS_OFF=coverage,docs node bin/pipeline.js …` |
| Remove it for good | delete `addons/<name>/` (and its workflow, if it has one; listed below) |
| Check from a workflow | `node bin/addon.js enabled <name>` exits 0 when on |

The core calls addons at three places only (`lib/addons.js` documents the hooks): `facts` in `bin/atlas-facts.js`, `afterTests` in `bin/after-tests.js` (CI, after Jest ran), and `prepare` / `topics` / `topicAppend` / `views` in `bin/atlas.js` (data derived from the final facts, Markdown and HTML). With every addon off, the pipeline's output is the same as before addons existed.

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

## nextsteps: ranked next steps with AI prompts

Every section's findings become next steps, ranked on the risk scale (impact × likelihood, 1–5 each): **P1** ≥ 16 do now, **P2** ≥ 9 next, **P3** later. Each step has a kind (Fix, Test, Verify, Review), its `file:line` evidence, and a prompt block for a coding agent.

- **Sources**: risks; UI promises the server does not enforce (UIS); roles that reach data they should not (AUT); status transitions where UI and server disagree (STA); unhealthy coding patterns (PAT); layer violations (DEP); actions without a handler (API); untested equivalence classes (COV / TST, from the coverage addon when on) and the all-pairs suite; mutation survivors (MUT, when the nightly run added them); draft rules that fire (RLS). A fact that cites the same `file:line` as a risk joins that risk, so one finding is one step, listed in every section that points at it.
- **On the page**: a "Next steps" panel under every section, "Start here" (P1 + P2) on the overview, a NXT section with a filterable ranked list, a priority matrix and counts per section, and badges in the sidebar. Tick steps anywhere; a bar at the bottom combines them into one prompt: header (repo, commit, atlas link) + one block per step + a closing instruction for **Plan** (no code), **Implement** (one commit per step, tests named under "Done when") or **Tests only** (cds.test, `it.skip` for intended behaviour). "Copy" on a single step does the same for that step. The selection is kept in the browser.
- **Outputs**: `NEXT` in `atlas/atlas-data.json`, `topics/01-nxt-next-steps.md` (ranked table plus every prompt block), a "Next steps" table at the end of each topic file, KPI "P1 next steps".
- **When**: in `bin/atlas.js` (`prepare` hook), so it always reflects the latest facts, including coverage results after CI and a later mutation run.
- **Files**: `addons/nextsteps/` (`nextsteps.js` ranking and prompt text, `index.js` hooks, `view.js` page panels, tray and NXT views).

## uitests: UI tests for what the UI promises

The backend tests show the server accepts what the UI hides. This addon tests the other lock: does the Fiori elements UI actually hide, disable or lock what its annotations say? Every UI promise from the UIS section becomes one check per state of the record (an equivalence class), run in the real app in headless Chromium.

- **Generated from**: `@Core.OperationAvailable` (header action enabled / disabled, display mode), `@Common.FieldControl` (fields editable / read-only, edit mode, also on child object pages), `@readonly` (read-only in edit mode), `@UI.CreateHidden` / `@UI.DeleteHidden` (table Create / Delete button shown / hidden in the parent's edit mode, also for tables in custom sections). Records come from the CSV seed data, the expected state from the annotation (the field-control `case` expression is evaluated per status). Side effects, `@mandatory` and `@assert.range` are listed as not generated, with the reason (the backend tests cover them).
- **Tests**: OPA5 journeys with `sap.fe.test`, the API SAP's own Fiori elements samples use, in `run/tests/ui/<app-id>/uitests.qunit.{html,js}`. Checks on the same record and mode share one app start ("visit"); a marker assertion `[UIT:…]` after each check ties results to classes. Edit-mode visits create the draft through OData (`draftEdit`) and discard it afterwards.
- **Runner**: `node addons/uitests/run.js <out> <app-root> [--baseline] [--filter V4] [--url http://localhost:4004]` copies the journeys to `<webapp>/test/discovery/`, starts the app with `npx cds-serve` (in-memory SQLite, mocked auth, `cds-plugin-ui5` for the UI), runs the page in Playwright Chromium, screenshots failures, writes `run/tests/ui/results.json`, exits 1 on a failed check. `--baseline` also runs the app's own OPA pages (`webapp/test/integration/*.qunit.html`), reported apart. `UI5_CDN_MIRROR=http://host:port` serves ui5.sap.com from a mirror when the CDN is not reachable.
- **Outputs**: atlas section `UIT` with **Two locks** (per promise and state: UI and server block it / UI only / server only / allowed, plus the test result), **Test runs** and **Not generated**; `topics/NN-uit-ui-tests.md`; `pr/uitests.md`; KPI "UI checks passed"; a failed check becomes a P2 Fix in next steps.
- **SFlight**: 22 checks in 9 app starts (about 2.5 minutes), all pass; 9 states are guarded by the UI only. Breaking two annotations (acceptTravel always available, Create Booking never hidden) fails exactly those two checks. SFlight's own OPA journey passes 5 of 9 tests at the pinned commit.
- **Files**: `addons/uitests/` (`plan.js` cases from the graph, CSN, manifests and seed data; `opa.js` journey writer; `run.js` runner; `index.js` hooks; `view.js` atlas views). CI step: "Run the generated UI tests" in `.github/workflows/sflight.yml`.

## Atlas layout (core switch, not an addon)

`"atlas": { "layout": "pages" }` (default) shows a sidebar grouped by question (Start, Structure, Behaviour, Security and risk, Testing), the overview with KPIs and section cards as the home page, one section per page with previous / next links, and URLs like `index.html#rsk`. `"single"` is the earlier long page. `DISCOVERY_ATLAS_LAYOUT=single` sets it for one run, and readers can switch with the button at the top right (remembered in their browser). All display variants per section stay as tabs; the "keep this view" picker is gone.
