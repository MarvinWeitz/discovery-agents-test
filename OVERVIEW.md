---
title: CAP discovery pipeline overview
scope: CAP Node.js + UI5 (+ HANA via CDS)
date: 2026-10-29
toolkit: cap-discovery-toolkit
---

# CAP discovery pipeline: overview

One command maps an app with fixed tools. Agents then read the slices the tools cannot fully understand, and their findings flow back into the same fact file. Every fact carries `file:line` evidence, and an agent fact is only accepted when its quote is on the cited line.

## 1. Deterministic vs agentic

The exact stage list with inputs, outputs and switches is generated: [docs/stages.md](docs/stages.md). Mode `static` (default) is steps 1 to 13b and complete on its own; mode `static+ai` adds the agentic steps, which read and write only the findings layer.

D = deterministic (same input, same output, no LLM). A = agentic (LLM agent, reviewed by a deterministic gate). H = human.

| # | Step | Kind | Tool / module | Output |
| --- | --- | --- | --- | --- |
| 0 | Pick app root, extra UI5 folders, curated file | H | `bin/pipeline.js` arguments | |
| 1 | Compile CDS to CSN with locations | D | `@sap/cds` → `lib/extract/model.js` | services, entities, associations, constraints, actions, grants |
| 2 | Parse handlers on the syntax tree | D | `typescript` → `lib/extract/handlers/` | handlers, helpers, rejections, derivations, CQL reads/writes |
| 3 | UI promises vs server (reflexion) | D | `lib/analyse/reflexion-ui.js` | UiRule verdicts |
| 4 | UI5 apps, mock users, roles, tests, churn | D | `lib/extract/{ui5,config,auth,tests,history}.js`, `git` | apps, routes, users, tests and the users they run as |
| 5 | CDS file dependencies and layer rules | D | `lib/extract/cds-deps.js` | uses / annotates / extends with ok, skip, bad |
| 6 | Lint | D | `@sap/eslint-plugin-cds`, `@ui5/linter` | findings |
| 7 | Slices and risk ranking | D | `lib/analyse/slices.js` | slice catalogue |
| 8 | Authorization matrix | D | `lib/analyse/authz.js` | user × operation, draft inheritance, row-level filters |
| 9 | Test design | D | `lib/analyse/test-design.js` (+ CSV seeds) | 7 categories, equivalence classes, seeded all-pairs, concrete requests |
| 10 | Pattern detection | D | `lib/analyse/patterns.js` | patterns with health |
| 11 | Risk rules | D | `lib/analyse/risks.js` | scored risks with the test that catches each |
| 12 | Generate cds.test suites | D | `bin/gen-tests.js` | `today:` tests and `it.skip` `spec:` tests, syntax-checked |
| 13 | Render atlas | D | `bin/atlas.js`, Playwright, d3 | Markdown, PNG, interactive HTML |
| 13b | Findings and gaps: every judgement and every open question, machine-readable, with JSON Schemas; validated | D | `bin/findings.js`, `bin/validate.js` | `run/findings/findings.jsonl`, `gaps.jsonl` |
| 13c | AI requests for open gaps (mode `static+ai`) | D | `bin/ai-requests.js` | `run/ai/requests/` |
| 13d | Answer gaps | A | `gap-resolver` | `run/ai/answers/` |
| 13e | Accept AI answers (quote on the cited line) | D | `bin/ai-merge.js` | `run/findings/ai.jsonl`, gaps `answered` |
| 14 | Slice brief | D | `bin/brief.js` | per-slice context with 10 fixed questions |
| 15 | Trace flows, explain rules and states, map integrations | A | `flow-tracer`, `behaviour-analyst`, `event-integration-analyst` | facts JSON |
| 16 | Accept agent facts | D | `bin/merge.js` (file:line + verbatim quote check) | merged graph, rejection log |
| 17 | Find risks rules cannot see | A | `risk-reviewer` | `curated/<app>.json` |
| 18 | Review test design | A | `test-reviewer` | `tests/review.md`, extra tests |
| 19 | Rerun with agent findings | D | `bin/pipeline.js --base` | atlas marks agent risks; drops those a rule now finds |
| 20 | Run generated tests in the app's CI | D | app's jest / mocha | pass/fail per class |
| 21 | Pick next steps, legal review | H | atlas "Next steps" (copy a combined prompt for a coding agent), `THIRD-PARTY-LICENSES.md` | |

What only agents find, on the pilots: crashes on unexpected paths (SFlight `deductDiscount` 404 path reads `travel.ID` from undefined), races (`max(TravelID) + 1`), hard-coded values (USD in analytics), a commented-out grant behind a FIXME and an ownership field users can overwrite (event app). Everything else in the atlases is generated.

## 2. Results on three public apps

| App | Graph nodes / edges | Patterns | Layer violations | UI rules server skips | Risks rule + agent | Classes | Covered today | Generated tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cap-js/incidents-app | 92 / 128 | 21 | 1 | 0 / 1 | 6 + 0 | 17 | 4 | 8 |
| SAP-samples/cap-sflight | 256 / 407 | 32 | 3 | 7 / 16 | 12 + 3 | 108 | 12 | 19 |
| SAP-samples/ui5-cap-event-app | 85 / 83 | 13 | 0 | 0 / 0 | 4 + 2 | 17 | 0 | 3 |

Atlases: `discovery-runs/<app>/atlas/README.md` (Markdown), `index.html` (interactive), `images/` (PNG). Generated tests: `discovery-runs/<app>/run/tests/generated/`.

On SFlight the generated facts reproduce the earlier hand analysis: 9 of the 12 hand-found risks are now found by rules; the other 3 stay as agent findings.

## 3. Suite catalogue

### Built here

| Part | Kind | Purpose |
| --- | --- | --- |
| `bin/pipeline.js` | CLI | runs steps 1 to 13 |
| `lib/project/` | layout | every folder and config assumption, read from the app's own CAP config |
| `bin/discover.js`, `lib/extract/`, `lib/analyse/reflexion-ui.js` | extractors | knowledge graph with evidence |
| `lib/analyse/` (authz, test-design, patterns, risks, slices, classes), `lib/atlas/` | analysers | matrix, classes, patterns, risks, atlas facts |
| `bin/gen-tests.js` | generator | cds.test suites |
| `bin/atlas.js`, `atlas/template.html` | renderer | atlas in three formats, 26 views |
| `bin/brief.js`, `bin/merge.js`, `bin/dossier.js`, `schema/facts.md` | agent harness | briefs, evidence gate, dossiers |
| `agents/flow-tracer.md`, `behaviour-analyst.md`, `event-integration-analyst.md`, `risk-reviewer.md`, `test-reviewer.md` | Claude Code subagents | the agentic steps |
| `skills/cap-discovery/SKILL.md` | skill | the whole workflow |
| `skills/cap-atlas-reader/SKILL.md` | skill | how an AI uses an atlas |

### Used as is

`@sap/cds` and `@sap/cds-compiler` (CSN), `@sap/eslint-plugin-cds` + `eslint`, `@ui5/linter`, `typescript` compiler API, `playwright` (Chromium), `d3`, `d3-sankey`, `mermaid`, `git`.

### Ideas reused, code written here

Reflexion models (Murphy, Notkin, Sullivan), CodeWiki-style layered docs, PICT all-pairs, dependency-cruiser and ArchUnitTS layer rules, the wshobson C4 agent split, the CAP checks in SAP's codeql-sap-js queries.

### Reference only

GitNexus (non-commercial licence), secondsky/sap-skills (GPL). Evaluated but not used yet: Joern, Opengrep, codebase-memory-mcp, the CAP and UI5 MCP servers. CodeQL is excluded because it needs a paid licence for private repos.

## 4. Licences

See `THIRD-PARTY-LICENSES.md`. Open item for legal review: the SAP Developer License on `@sap/cds`, `@sap/cds-compiler`, `@sap/eslint-plugin-cds` (and `@sapui5/types` via the UI5 linter). The toolkit calls them and never bundles them; in a customer setting, use the customer's own installation. Everything else in use is MIT, ISC, BSD-3-Clause or Apache-2.0; `git` (GPL-2.0) is called as a separate program.

## 5. Limits

- The sandbox here blocks running pilot code, so generated tests are syntax-checked, not executed.
- Coverage of existing tests is matched by name and is approximate.
- Runtime-only behaviour (anonymous access behind an approuter, row filters during draft activation) is marked "verify".
