---
piece: 13 of 13
title: Findings and gaps (the middle layer), stages, modes, validation
code: lib/stages.js, lib/findings/, bin/findings.js, bin/validate.js, bin/stages.js, bin/ai-requests.js, bin/ai-merge.js, lib/manifest.js, lib/evidence.js, schema/*.schema.json
runs: bin/pipeline.js (findings, ai-requests, validate); bin/after-tests.js in CI (findings again); bin/ai-merge.js on demand
---

# Piece 13: Findings and gaps

A run has three layers. The **facts** say what the app consists of (graph, CSN, `$metadata`; pieces 2 to 5). The **presentation** is for people (atlas, docs, PR comments; piece 11). Between them sits the **middle layer**: every judgement the run made, and every question it could not settle, in two machine-readable files with a JSON Schema each. It is complete with static analysis alone; a measurement or an AI pass adds to it later, always marked with how it was found.

| File | One line per | Schema |
|---|---|---|
| `run/findings/findings.jsonl` | finding: something the run decided, with evidence, method and status | `schema/finding.schema.json` |
| `run/findings/gaps.jsonl` | gap: a question static analysis could not answer, with who can | `schema/gap.schema.json` |
| `run/findings/summary.json` | counts by kind, method, status, resolver, priority | – |
| `run/findings/README.md` | the same for people and for an AI reading Markdown | – |
| `run/findings/ai.jsonl` | AI finding that passed the evidence gate (only used in mode `static+ai`) | `schema/finding.schema.json` |
| `manifest.json` | stage of this run: status, start, seconds, outputs with sha256 | `schema/manifest.schema.json` |

The stage list with every input and output is generated: [docs/stages.md](../stages.md).

## Decisions, in run order

### D1. Stages are declared once (`lib/stages.js`)
- **What:** one list of stages with `when` (pipeline, ci, on-demand, by-hand), `method` (static, measured, ai), `switch`, code, inputs and outputs. `bin/pipeline.js` runs the pipeline stages in that order and records each in `manifest.json`; `bin/stages.js write` renders `docs/stages.md` from the same list; a unit test fails when the page is out of date.
- **Why:** "what happens when" must be readable without reading code, and must not drift from it.

### D2. Modes: `static` and `static+ai`
- **What:** `--mode`, else `DISCOVERY_MODE`, else `"mode"` in `discovery.config.json`; default `static`.
  - `static`: no AI request files; `ai.jsonl` is ignored even when present; the validator rejects an AI finding. Complete and valid on its own.
  - `static+ai`: also writes `run/ai/requests/` for the open gaps an AI can work on, and includes the AI findings that passed the gate.
- Measured results (CI) do not depend on the mode: they come from the running app, not from a model.
- **Switching back:** `node bin/findings.js <out> --mode static` rebuilds the findings without the AI layer; the AI files stay on disk.

### D3. Findings are what the run already decided, not new analysis (`lib/findings/static.js`)
Each collector calls the same functions the atlas uses, so the two never disagree.

| Kind | From | Status | Raises gap |
|---|---|---|---|
| `risk` | `lib/analyse/risks.js` (key, impact × likelihood, test) | detected | – |
| `agent-risk` | curated base (`--base`), reviewed by a person: method `human` | confirmed | – |
| `pattern` | `lib/analyse/patterns.js` (health → severity) | detected | – |
| `ui-promise` | `UiRule` nodes (piece 4) | detected; `suspected` when ui-only or partial | `enforcement-elsewhere` |
| `authz` | `lib/analyse/authz.js`, one per operation, all users' cells in `data` | detected; `suspected` with unclear cells | `authz-unclear` |
| `layer-violation` | CDS dependency edges with verdict bad (piece 5f) | detected | – |
| `lint` | `Finding` nodes (cds lint, ui5 lint) | detected | – |
| `state-transition` | state machine rows where UI and server disagree (piece 8) | detected | – |
| `action-without-handler` | `Action` nodes no handler handles (draft actions excluded) | suspected | `handler-missing` |
| `native-sql` | SQL strings in handler files (piece 3e) | detected | `native-sql-effect` or `hana-only-path` |
| `custom-route` | `HttpRoute` nodes (piece 5i, F13) | detected | `custom-route-behaviour` (not for static folders) |
| `plugin-code` | `PluginFile` nodes (piece 5i, F8) | detected | `plugin-binding` when no handler could be bound |
| `analysis-limit` | the probe: app not installed, model did not compile (F11, F12) | detected | `missing-install` |
| `rule-hit` | addon `rules`: a library rule fires | detected (accepted rule) or suspected (draft) | `rule-confirmation` for drafts |
| `authz-measured` | addon `measured` in CI: CAP's answer per user | confirmed, or refuted when a cell differs | settles `authz-unclear` |
| `rule-reached` | addon `measured` in CI: a handler rule no test executes | detected (measured) | – |
| `handler-check` | addon `runtime` in CI: registered but not parsed, or parsed but not registered | confirmed / suspected | settles `handler-missing` for that action |
| `ai-finding` | `bin/ai-merge.js`: an AI answer that passed the gate | suspected | settles the gap it answers as `answered` |

Gaps without a finding: `class-expectation` (an equivalence class whose expected outcome says "verify"), `slice-review` (the 10 fixed questions per slice, piece 12) and `business-criticality` (a person sets the slice weight, piece 6).

### D4. Every finding says how it was found and how sure it is
- `method`: static (files and CAP's compiler), measured (the running app), ai (an LLM, through the gate), human (a person, e.g. the curated file).
- `status`: detected (a deterministic rule fired), suspected (heuristic, draft rule or AI), confirmed (measured or reviewed), refuted (a measurement or review showed otherwise).
- `evidence`: `file`, `line` (relative to the app root), `quote` (required for AI). `subjects`: graph node ids. `source`: the tool or rule.

### D5. Every gap says who can settle it
- `resolvableBy`: measured, ai, human, best first. `priority`: high, medium, low. `look`: files and lines to read first. `expects`: what a good answer contains. `why`: why static analysis could not answer.
- **Lifecycle:** `open` → `answered` (an AI finding passed the gate; the reasoning is not reviewed) → `resolved` (a measured or human finding settles it). A finding settles a gap by listing it in `resolves`; `resolvedBy` on the gap points back.
- An AI answer of "unknown", or one whose findings were all rejected, stays visible on the open gap under `data.ai`.

### D6. Ids are stable
- `F-<kind>-<10 hex>` and `G-<kind>-<10 hex>`: SHA-1 of the kind and a key that names the thing (a risk key, a UI rule id, service and operation, file and SQL text), never the run time. The same code gives the same ids, so a later AI answer still finds its gap, and two runs can be compared. When the code changes so that a gap disappears, its old AI findings are kept out (not guessed onto another gap).

### D7. Validation is a stage (`bin/validate.js`)
- Every file against its schema (Ajv, JSON Schema 2020-12); ids unique; every `gaps`, `resolves`, `about`, `resolvedBy` link resolves; subjects exist in the graph; evidence files exist in the app and the line is inside the file; a resolved or answered gap names what settled it; mode `static` holds no AI finding; AI evidence has a quote; answer files are named after their gap.
- A failed validation fails the pipeline, the after-tests step in CI and `bin/ai-merge.js`.

### D8. Addons add findings through one hook
- `findings(book, ctx)` in `addons/<name>/index.js` (documented in `lib/addons.js`): `book.finding({...})`, `book.gap({...})`, ids from `lib/findings/book.js` (`findingId`, `gapId`) to point at core findings and gaps. The core works without any addon.

### D9. The AI pass reads only this layer (`bin/ai-requests.js`, piece 12 D8)
- One request per open gap with `ai` in `resolvableBy`: question, why, what the run knows (the findings that raised it, the graph nodes), files to read with code excerpts (6 lines around each cited line, at most 4), and the answer format with a filled-in example. `run/ai/requests/index.json` lists them by priority.
- The AI writes `run/ai/answers/<gap>.json`; `bin/ai-merge.js` gates and merges. Nothing an AI writes reaches the facts or the atlas directly.

## Switches

| Switch | Effect |
|---|---|
| `"mode": "static"` / `"static+ai"` (or `--mode`, `DISCOVERY_MODE`) | see D2 |
| `"stages": { "findings": false }` (or `DISCOVERY_STAGES_OFF=findings`) | no `run/findings/`, no AI requests; the validator checks the rest. The atlas is unchanged either way |
| `"addons": { … }` | an addon that is off adds no findings |

## Every hard-coded fact in this piece

| Value | Where |
|---|---|
| finding kinds, gap kinds, statuses, methods | `schema/finding.schema.json`, `schema/gap.schema.json` |
| severity level from impact × likelihood: ≥ 16 critical, ≥ 9 warning | `lib/findings/book.js` `level` |
| UI promise gap priority: ui-only high, partial medium | `lib/findings/static.js` |
| slice-review priority: highest-risk slice high, next two medium | `lib/findings/static.js` |
| draft actions excluded from "no handler" | `lib/findings/static.js` `GENERIC_ACTIONS` |
| id = SHA-1 of kind and key, 10 hex | `lib/findings/book.js` |
| evidence window ±2 lines, quote ≥ 8 characters | `lib/evidence.js` |
| request excerpts: ±6 lines, at most 4 | `bin/ai-requests.js` |
| README lists at most 200 gaps and 80 findings per kind (the JSONL files have all) | `lib/findings/index.js` |

## Output
`run/findings/` (findings.jsonl, gaps.jsonl, summary.json, README.md, ai.jsonl), `pr/findings.md`, `manifest.json`; in mode `static+ai` also `run/ai/requests/`, `run/ai/README.md`, and after an AI pass `run/ai/answers/`, `run/ai/merge-log.json`.
