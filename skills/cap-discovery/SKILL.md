---
name: cap-discovery
description: Discover a CAP Node.js + UI5 app end to end (architecture, data model, dependencies, flows, states, authorization, patterns, risks, interfaces, test design) with the cap-discovery-toolkit, then deepen it with the agent suite. Use when asked to analyse, document or plan tests for a CAP Node.js application.
---

# CAP discovery

Strategy: map wide with fixed tools, slice deep with agents, converge into one atlas. Every fact carries `file:line` evidence. Scope is CAP Node.js; a Java backend in the same repo is ignored.

## 1. Deterministic pass (no LLM)

```sh
cd <toolkit>            # npm install --ignore-scripts once
node bin/pipeline.js <app-root> <out> [--ui ../ui-a,../ui-b] [--base curated/<app>.json] [--mode static|static+ai]
```

- `<app-root>` holds `db/`, `srv/`, `app/` and `package.json`. In a monorepo, point it at the CAP package and list UI5 projects elsewhere with `--ui` (paths relative to the app root).
- The app needs no `npm install`. Do not run the app or its tests from the toolkit; generated tests are for the app's own CI.
- Output: `<out>/run` (graph, metrics, slices), `<out>/run/tests/generated` (cds.test suites), `<out>/atlas` (`README.md`, `topics/*.md`, `images/*.png`, `index.html`), `<out>/atlas-data.json`.
- Read `<out>/atlas/README.md` first. Check the KPI row and the `check:` warnings the run printed.
- Machine-readable middle layer: `<out>/run/findings/findings.jsonl` (every judgement, with evidence, method and status) and `gaps.jsonl` (every question static analysis could not settle, with who can: measured, ai, human). Schemas in `schema/`; overview in `run/findings/README.md`. What ran: `node bin/stages.js show <out>`.
- Mode `static` (default) is complete on its own and validated (`bin/validate.js`). Mode `static+ai` also writes `run/ai/requests/` for the AI pass below.

## 1b. AI pass on the gaps (optional)

1. `node bin/ai-requests.js <out>` (done by the pipeline in mode `static+ai`): one request per open gap an AI can settle, in `run/ai/requests/`, highest priority first in `index.json`.
2. For each request, run the `gap-resolver` agent; it writes `run/ai/answers/<gap>.json` (`schema/ai-answer.schema.json`).
3. `node bin/ai-merge.js <out>`: the evidence gate accepts a finding only when its quote is on the cited line, rebuilds `run/findings/` in mode `static+ai` and validates. AI findings stay `suspected`, their gaps `answered`.

## 2. Agentic pass (slices, deeper)

1. Pick slices from `<out>/run/slices/catalog.json`, highest risk first.
2. `node bin/brief.js <out>/run <app-root> <slice-id>` writes the brief.
3. Run the agents from `agents/` on the brief, in this order: `flow-tracer`, `behaviour-analyst`, `event-integration-analyst`, then `risk-reviewer`. Each writes `slices/<id>/facts/<agent>.json` (format `schema/facts.md`).
4. `node bin/merge.js <out>/run <app-root> <slice-id>` accepts only facts whose quote is really on the cited line; `node bin/dossier.js <out>/run <slice-id>` writes the slice dossier.
5. `risk-reviewer` writes `curated/<app>.json` with the risks the rules cannot see (crashes, races, hard-coded values, FIXMEs, ownership fields). `test-reviewer` corrects `verify` classes and adds tests.
6. Rerun step 1 with `--base curated/<app>.json`; agent risks appear in the atlas marked "agent", and any a rule now finds is dropped.

## 3. Deliver

- People: `atlas/index.html` (interactive, several views per topic) or the Markdown with images.
- AI agents: `atlas/README.md` → topic files; tables are authoritative, images add nothing.
- Testers: `run/tests/generated/README.md`; `today:` tests pin behaviour, `it.skip` `spec:` tests turn red findings into acceptance tests.

## Rules

- Never claim a runtime behaviour as fact unless a request showed it; write "verify".
- Track every new tool and its licence in `THIRD-PARTY-LICENSES.md`. SAP-licensed packages are called, never bundled.
- Do not use paid tools (no CodeQL / GitHub Advanced Security).
