---
piece: 11 of 12
title: Atlas facts, rendering, and the addons
code: bin/atlas-facts.js + lib/atlas/ (index.js, sections/<code>.js, util.js); bin/atlas.js + atlas/template.html; lib/addons.js; addons/*; bin/after-tests.js
runs: bin/pipeline.js steps "facts" and "atlas"; after-tests and the diff and mutation addons in CI
---

# Piece 11: Atlas and addons

Goal: one fact file (`atlas-data.json`) that holds every section, and three views of it: Markdown with PNG images for people and AI, an interactive HTML page, and the images alone.

## Decisions, in run order

### D1. Facts are rebuilt from the run, not from memory
- `bin/atlas-facts.js` loads the graph from `run/graph/*.jsonl` and **compiles the CDS model again** (same folders as piece 2), because the CSN is not stored in the run.
- **Why:** the facts step can be rerun alone, for example with a new curated file, without repeating discovery.
- **Assumes:** the app folder recorded in `metrics.json` still exists at the same path.

### D2. One builder per section (`lib/atlas/sections/`)

| Code | Builder | Reads |
|---|---|---|
| ARC | `arc.js` | apps, services, handlers, external systems, databases (HANA when the config, HDI artifacts or HANA dependencies say so; SQLite when the config or dependencies say so), layer stack with counts and warnings |
| DAT | `dat.js` | entities grouped as draft documents, master data, code lists, common; composition tree; personal data |
| DEP | `dep.js` | CDS files and their `uses` / `annotates` / `extends` with verdicts (piece 5f) |
| FLW | `flw.js` | fields written per entity (Sankey), the handler with the most steps (swimlane), lifecycle events with server and UI hooks |
| STA | `sta.js` | state machine of the status field from the transitions (piece 8); only when the app has OperationAvailable rules with states |
| AUT | `aut.js` | the matrix (piece 7), PII reach, role chain |
| UIS | `uis.js` | the reflexion table (piece 4) with verdict symbols |
| TST | `tst.js` | categories and classes (piece 8), the all-pairs table |
| API | `api.js` | service roots, entity sets with methods and access (`auth`, `auth?` through a guarded draft root, `open`), actions with roles and missing handlers |
| PAT, RSK | `index.js` | patterns and risks (piece 9), plus agent risks from the curated file (piece 12) |

- **Headline per section:** one sentence with the key numbers, built from fixed templates. Bold marks a finding.
- **KPIs:** apps, services, entities, handlers, patterns, layer violations, UI rules the server skips, risks, classes, classes covered.
- **Title and lede:** from `package.json` name (scope removed, first letter upper case), repository URL and licence, unless the curated file sets them.

### D3. Addons (`lib/addons.js`)
- An addon is a folder in `addons/` with an `index.js`. It is on when `discovery.config.json` says `"<name>": true`, the folder exists, and `DISCOVERY_ADDONS_OFF` does not name it.
- **Hooks:**
  - `facts`: after the core sections are built
  - `afterTests`: in CI, after the tests ran
  - `prepare`, `topics`, `topicAppend`, `views`: in `atlas.js`
- With every addon off, the output is byte for byte what the core makes.

| Addon | What it adds | Runs |
|---|---|---|
| coverage | COV heatmap: each class tested by a generated test, by an existing request, or by name only | facts + afterTests |
| docs | `<out>/docs/`: per slice, statements at business, developer and tester level; ✅ only when a generated test for that class passed | facts + afterTests |
| rules | RLS section and `pr/rules.md` (piece 9c) | facts |
| uitests | UIT section and OPA5 journeys (piece 10 D6) | facts + CI step |
| nextsteps | NXT: ranked actions P1 (i×l ≥ 16), P2 (≥ 9), P3, each with a prompt for a coding agent; the page can combine selected items into one prompt | prepare |
| diff | PR comment comparing base and head runs (risks, patterns, verdicts, authorization cells, coverage; ids with line numbers matched by content) | own workflow `discovery-diff.yml` |
| mutation | MUT section: Stryker mutates the handler code, and the share of mutants the tests catch is the score | own nightly workflow `mutation.yml` |

### D4. Rendering (`bin/atlas.js`)
- **HTML:** `atlas/template.html` with the fact file inlined. Layout `pages` (sidebar, one section per page) or `single`, from `discovery.config.json` or `DISCOVERY_ATLAS_LAYOUT`.
- **Images:** Playwright opens the page and screenshots each view as `images/<CODE>-<view>.png`. d3 and d3-sankey are served from the toolkit's `node_modules`.
- **Markdown:** `README.md` (overview, KPIs, section list) and `topics/NN-<code>-<name>.md`, with tables, evidence and the images.
- **Why three views:** Markdown is what an AI agent or a diff reads best, the HTML is what a person explores, and the PNG files show the diagrams anywhere.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| CDS compiled again from the layout folders | bin/atlas-facts.js | same limits as piece 2 |
| database detection by `hana` / `sqlite` in config text and dependency names | sections/arc.js | Postgres apps show no database box |
| entity groups: draft documents, master data, code lists, `sap.common.*` | sections/arc.js, dat.js | – |
| HTTP verbs per event (UPDATE→PATCH, CREATE/NEW→POST, SAVE→POST draftActivate, READ→GET, DELETE) | sections/flw.js `VERB` | – |
| verdict symbols and colours | sections/uis.js `PV` | – |
| labels such as `<app>/*/webapp`, `<srv>/*.cds`, `<db>/data` | sections/arc.js | taken from the layout, so they follow renamed folders |
| title = package name without scope, capitalised | index.js | – |
| addon switch file `discovery.config.json`, env `DISCOVERY_ADDONS_OFF` | lib/addons.js | – |
| next-steps thresholds P1 ≥ 16, P2 ≥ 9 | addons/nextsteps | – |

## Output
`<out>/atlas-data.json` (also copied into `atlas/`), `<out>/atlas/index.html`, `README.md`, `topics/*.md`, `images/*.png`, and from the addons `<out>/docs/`, `<out>/pr/*.md` and `run/tests/ui/`.
