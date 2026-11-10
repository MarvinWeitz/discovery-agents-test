# 14 · Step products: every step publishes its own result

**Code:** `bin/products.js`, `lib/products/` (one module per product in `lib/products/steps/`), `bin/query.js`
**Stage:** `products`, after `atlas` in `bin/pipeline.js`, again in `bin/after-tests.js` (CI, with the test results) and `bin/ai-merge.js`. Switch: `"stages": { "products": false }` or `DISCOVERY_STAGES_OFF=products`. Optional: a failure here never fails the run.

## What and why

The atlas is one big result at the end. Each step of the run already knows something useful on its own (the model, the handlers, the authorization matrix, the test results), and people and agents ask questions that cut across steps ("what is affected if I change Travel?"). So every step publishes its own product, in the same four depths:

| Depth | File | For |
| --- | --- | --- |
| L0 | `steps/<id>/summary.json` | 3-5 numbers and a status: start page tiles, PR comment, trends |
| L1 | `steps/<id>/README.md` + `views/*.svg` | a short card with pictures and the top items. Agents read this first |
| L2 | `steps/<id>/*.html` | an explorer: a proven viewer where one exists, our own only where none does |
| L3 | `steps/<id>/data/` | the full data, in a standard format where one exists |

`steps/index.html` / `index.md` is the start page, `steps/products.json` the list. With `--base <other-out>`, every number also carries its change since that run.

## The products

| Product | Step | L2 explorer | L3 format |
| --- | --- | --- | --- |
| Run timeline | the run | – | `stages.json` (manifest) |
| Project passport | probe | – | `project.json` (what CAP answered) |
| Model map | cds compile | **model and impact explorer** (Cytoscape.js): graph, rings or layers, click to start from any node | `model-graph.json`, `impact/<Entity>.md` |
| API surface | EDMX, OpenAPI, AsyncAPI | Redoc per service | EDMX, OpenAPI 3 (`@cap-js/openapi`), AsyncAPI (`@cap-js/asyncapi`) |
| Behaviour matrix | handler AST | – (Mermaid sequence in the card) | `handlers.json` |
| Screen map | UI5, Fiori annotations | – | `ui-promises.json` |
| Access map | authorization | – | `access.json` (static and measured) |
| Code findings | lint, Opengrep, rules | VS Code SARIF Viewer, code scanning | SARIF 2.1.0 |
| Hotspots and change coupling | git history | – | `hotspots.json`, `coupling.json` |
| Evidence ledger | findings and gaps | – | `findings.jsonl`, `gaps.jsonl` (JSON Schema) |
| AI ledger | AI gap pass | – | `merge-log.json`, `requests.json` |
| Classification tree | test design | – | `classes.json`, `class-seeds.json` |
| Test results | test run (CI) | – | CTRF (`results.ctrf.json`) |
| Coverage by class | coverage | – | `coverage.json` |
| Test strength | mutation (nightly) | Stryker report (mutation-testing-elements) | `mutation-summary.json` |

A product that has nothing in this run says why (`not-run`: tests run in CI, AI only in mode `static+ai`, mutation nightly).

## Impact analysis

`lib/products/impact.js` walks the graph against the direction of dependency. Edge `a rel b`: `a` depends on `b` for `projects_on, exposes, handles, reads, writes, shows, mentions, has_route, has_view, uses, enforced_by, checked_in, calls, navigates_to`; `b` depends on `a` for `has_action, enforces, requires`; `composes` both ways. Roles are reached but not walked further (their users did not change). Associations are followed only on request (`--assoc`): most changes do not break them, a key change does.

**Assumptions:** the graph is complete enough. Code the handler parser cannot bind (dynamic registrations, plugins) is missing from the impact, as everywhere else; the findings list those as gaps. Element-level impact (change one field) is the next step: the CSN has the column references of every projection.

## Questions across products

```sh
node bin/query.js <out> impact Travel --depth 3          # what is affected
node bin/query.js <out> who-can "Travel DELETE"          # static and measured
node bin/query.js <out> tests-for srv/travel-service.ts:105
```

Each answers in Markdown, so the cap-discovery skill or any agent can call it.

## Where it is shown

- Locally: open `<out>/steps/index.html`.
- Run discovery workflow: published to GitHub Pages next to the atlas, `<pages>/<slug>/steps/`.
- Portable mode (`cap-discovery all --docs <dir>`): copied to `<dir>/steps/`.
- In every CI artifact under `<out>/steps/`.

The pages load Cytoscape.js, Mermaid, Redoc and mutation-testing-elements from public CDNs (cdnjs, jsDelivr); the Markdown cards and SVGs work without them.
