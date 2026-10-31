---
title: Every assumption the pipeline makes, ranked, and who decides it
scope: pieces 1 to 12 of the walkthrough
---

# Assumptions index

When a new repo breaks something, look here first. Each line names the assumption, who decides it now, and the walkthrough piece that explains it.

**Rule since 2026-10-31:** ask CAP before guessing. `lib/project/probe.js` runs in the app folder with the app's own `@sap/cds` (the toolkit's one only when the app is not installed) and reports what CAP itself resolves. Discover writes the answer to `run/project.json`; every step reads it through `lib/project/cap.js`. A guess is only the fallback when CAP cannot answer.

## What the probe asks CAP

| Question | CAP API (CLI equivalent) | In `project.json` |
|---|---|---|
| effective config per profile (all config files, `.cdsrc.yaml`, env variables, plugins, profiles) | `cds.env.for('cds', root)` with NODE_ENV unset, `test`, `production` (`cds env`) | `requires`, `test`, `production`, `profiles`, `folders`, `plugins` |
| which CDS files form the model | `cds.resolve('*')` (`cds resolve`) | `model.files` |
| every file the compiled model came from | `csn.$sources` after `cds.load` | `model.sources` |
| URL path and protocols per service | `cds.compile.to.serviceinfo` (`cds compile --to serviceinfo`) | `services` |
| which file implements each service | the rule of `cds.serve` (`@sap/cds/lib/srv/factory.js`) | `impls` |
| which seed files CAP loads, into which entity | `cds.deploy.resources` (`cds deploy`) | `seed` |
| custom bootstrap | `server.js` / `server.ts` in the root, which `cds serve` loads | `server` |
| the compiled model, once, with the app's compiler | `cds.load` (`cds compile`) | `run/csn.json` |
| OData metadata per service | `cds.compile.to.edmx` (`cds compile --to edmx`) | `edmx`, files in `run/edmx/` |

Beyond the probe, three more steps now ask a tool instead of reading text:

| Question | Tool | Piece |
|---|---|---|
| `annotate` / `extend` targets and lines | CAP's parser `cds.parse.cdl` | 5f |
| which files are the app's tests | the app's Jest, `jest --listTests` | 5d |
| which handlers really exist, at which line, on which service path | the running app (`cds.test`), recorded by addon `runtime` | 3 D7 |

Credentials in `cds.requires` are never written; only their key names are.

The CAP docs section and `@sap/cds` source file behind each question are in [references.md](references.md). Check those when a new cds version comes out.

## Ranked: importance × how often it differs between projects

Importance: how much of the output is wrong when the assumption is wrong. Differs: how likely a real project does it differently.

| # | Assumption | Importance | Differs | Before | Decided now by | Piece |
|---|---|---|---|---|---|---|
| 1 | effective CAP config (which file, which profile, which plugin) | high | high | `package.json` "cds" and `.cdsrc.json` read as text | probe: `cds.env` per profile | 5b, 5c |
| 2 | which CDS files form the model | high | high | db + srv + app folders | probe: `cds.resolve('*')` (roots, `cds.requires.*.model`, plugins) | 2 |
| 3 | service URL paths | high | medium | own rule (`@path`, `/odata/v4/<kebab>`) | probe: `serviceinfo` (also `@protocol`, multiple protocols, cds version defaults) | 2 |
| 4 | which file implements which service | high | high | srv folder + sibling `.js` + `@impl` | probe: `cds.serve`'s rule (`@impl`, sibling in `/`, `lib/`, `handlers/`, `cds.requires.<srv>.impl`) + `server.js`; srv folder still walked for helpers | 3 |
| 5 | remote services and message brokers | high | high | `package.json` only (F5) | probe: `cds.requires` of development + production; the `impl` CAP resolves decides remote vs broker, kind lists as fallback | 5b |
| 6 | mock users and `restrict_all_services` | high | medium | text + toolkit's cds defaults | probe: effective `cds.requires.auth` with the app's cds version | 5c, 7 |
| 7 | does the app need mocked auth to start in a test | high | medium | text of `[development]`/`[test]` | probe: auth kind in the `test` profile | 1 |
| 8 | database per profile | medium | high | text search for `hana`/`sqlite` | probe: `cds.requires.db` (kind, model, impl) for every profile the app declares; text only when a profile has no db (plugin not installed) | 11 |
| 9 | CSV seed data | medium | medium | `<db>/data`, `<db>/csv`, `test/data` | probe: `cds.deploy.resources` (data/ and csv/ next to every model file, `cds.requires.db.data`), entity per file from CAP | 8 |
| 10 | CDS files scanned as text (evidence, layers) | medium | medium | every `.cds` under app/srv/db minus `xmpls` | probe: the app's own files in `csn.$sources` | 4, 5f |
| 11 | HDI source folders and file types | medium | low | `<db>/src`, `*.hdb*` | folders holding a `.hdiconfig` (the HDI deployer's marker) and its `file_suffixes`, else `<db>/src` | 5b, 5g |
| 12 | code list | medium | low | has `code`, `name`, `descr` | includes `sap.common.CodeList`, or that shape | 2 |
| 13 | personal data | medium | medium | English field names (F10) | `@PersonalData.IsPotentiallyPersonal/Sensitive` + the English names | 7 |
| 14 | FieldControl path root | medium | medium | skip `to_Travel` (F1) | skip leading associations to entities that are not code lists (CSN) | 4 |
| 15 | action parameter values in generated tests | medium | high | all `10` (F9) | one value per CDS type (enum: first value) | 10 |
| 16 | app namespace in report ids | low | high | `sap.capire.<x>.` (F4) | namespaces of the app's own db entities | 6 |
| 17 | guard wording in docs | low | high | strips `travel.`, `TravelStatusCode.` (F3) | strips any variable prefix and enum prefix; `req.user.id` → "the current user" | 11 |
| 18 | conditional-write coverage | low | high | test named "discount" (F2) | test named after the action that writes | 8 |
| 19 | db, srv, app folder names (intake, layers, labels) | medium | low | `cds.env.folders` in the pipeline's process | unchanged (needed before install, cheap) | 1, 5f |
| 20 | status column = `<field>_code` | low | low | – | unchanged: CAP's foreign-key name for a managed association to a code list (key `code`) | 8 |
| 21 | UI5 projects under the app folder + `--ui` | medium | medium | `webapp/manifest.json` only | `@sap-ux/project-access` (ui5.yaml `sourcePath`, Fiori tools apps), then the convention | 1, 5a |
| 22 | which files are tests | low | medium | `*.test|spec.js|ts` and `*Journey.js` | the app's Jest: `jest --listTests` (its `testMatch`, `roots`, ignores) + OPA journeys; name pattern without Jest | 5d |
| 23 | app detection in a cloned repo | high | medium | – | unchanged: skip list, depth 6, lockfiles, workspaces | 1 |
| 24 | `annotate` / `extend` targets in CDS files | medium | medium | regular expressions | CAP's parser `cds.parse.cdl` (multi-line, with line numbers); regex only when parsing fails | 5f |
| 25 | handlers the static parser finds are the ones that run | high | medium | – | checked in CI against the running app (addon `runtime`) | 3 |
| 26 | UI5 view events and bindings | medium | medium | 6 attribute names, text patterns | XML parser; event names from UI5's own type definitions | 5a |
| 27 | guards and where clauses | high | medium | text patterns | TypeScript AST and CAP's `cds.parse.expr` (CXN) | 3, 4 |
| 28 | entity SQL names in HANA artifacts | medium | medium | dots to `_`, upper case | the app's compiler with its `sql_mapping` | 5g |
| 29 | UI promises reach the UI | high | medium | CSN only | `$metadata` read with `@sap-ux/edmx-parser`; CAP-derived Capabilities and Computed added | 4 |
| 30 | authorization matrix is right | high | medium | static model of CAP's rules | measured in CI: every cell sent to the running app (addon `measured`) | 7 |
| 31 | which test exercises which class | medium | high | text scan of test files | measured in CI: request log via CAP's event API (addon `measured`); text scan without CI | 8 |

## What asking CAP showed on the pilots

| Pilot | Finding |
|---|---|
| cap-sflight | a `pom.xml` turns on the `java` profile for Node too, so `[java]` config applies and CAP lists Java service paths next to the Node ones (the Node ones are used) |
| cap-sflight | databases: SQLite in development, HANA in production (before: both, without the profile) |
| ui5-cap-event-app | SQLite in production as well, not only for local runs |
| ui5-cap-event-app | `server.js` adds a custom `/logout` route; the file is now read, the route is not yet an endpoint (F13) |
| Poetry Slam | profile `with-mtx-sidecar` is on by default; `byd_khproject` and other remote APIs come with their models from `cds.requires` |
| bookstore | `ReviewsService` and `OrdersService` are marked `external` by CAP; messaging is `file-based-messaging` in development |
| incidents-app | without an install, no `cds.requires.db` (the `@cap-js/sqlite` plugin adds it), so the text fallback decides the database box (F12) |
| HANA CodeJam | the model does not compile without the app's packages (F11); the probe still answers config, auth (xsuaa: mock auth needed) and model files |

## Where things are (`lib/project/`)

| File | Decides |
|---|---|
| `probe.js` | the questions to CAP (table above) |
| `cap.js` | `cap(root)` cached answer; `modelFiles`, `cdsSources`, `seedFiles`, `dbKinds`; the fallbacks |
| `layout.js` | folder names from `cds.env.folders`; fallbacks: `modelDirs`, `seedDirs`, `hdiDirs`, `ignored`, `layerOf`, `lintGlobs` |
| `config.js` | config files as text, only for `file:line` evidence (`package.json`, `.cdsrc.json`, `.cdsrc.yaml`, `.cdsrc-private.json`) |
| `files.js` | walks skip `node_modules` and dot folders |
| `detect.js` | app detection in a cloned repo, mock-auth check |

## What the code is assumed to look like

| Assumption | Decided in | Piece |
|---|---|---|
| CAP words: CRUD events, CQL verbs, phases, non-service receivers, remote call methods, SQL and HANA-only keywords, database kinds | `lib/extract/handlers/vocabulary.js` | 3 |
| a file's service when CAP's rule does not name it (class name, `@impl`, sibling, base name, split implementations) | `lib/extract/handlers/binding.js` | 3 |
| entity aliases from `.entities`, `cds.entities(ns)`, `#cds-models/` | `lib/extract/handlers/names.js` | 3 |
| UI promises = OperationAvailable, FieldControl, Create/DeleteHidden, SideEffects, readonly, mandatory, assert.range | `lib/analyse/reflexion-ui.js` | 4 |
| one status domain per app | `lib/analyse/reflexion-ui.js` | 4 |
| remote / broker kinds (`odata`, `rest`, `hcql`, `external: true`; messaging kinds) | `lib/extract/config.js` | 5b |

## Scores and thresholds

| Value | Decided in | Piece |
|---|---|---|
| slice weights churn 0.3, centrality 0.25, external 0.2, events 0.15, criticality 0.1; criticality fixed 0.5 | `lib/analyse/slices.js` | 6 |
| split slices above 8 handlers; association depth 4 | `lib/analyse/slices.js` | 6 |
| impact × likelihood per risk rule | `lib/analyse/risks.js` | 9 |
| all-pairs seed 7, 40 tries | `lib/analyse/test-design.js` | 8 |
| next steps P1 ≥ 16, P2 ≥ 9 | `addons/nextsteps` | 11 |

## Open fixes

| # | What | Status |
|---|---|---|
| F1 | FieldControl path root skipped `to_Travel` | **fixed**: navigation segments from the CSN |
| F2 | conditional-write coverage looked for "discount" | **fixed**: action name |
| F3 | docs addon stripped `travel.`, `TravelStatusCode.` | **fixed**: any variable or enum prefix |
| F4 | report stripped `sap.capire.<x>.` | **fixed**: the app's own namespaces |
| F5 | remote services read from `package.json` only | **fixed**: effective `cds.requires` |
| F6 | model roots other than db/srv/app not compiled | **fixed**: `cds.resolve('*')` |
| F7 | CSV seed data next to other model files not read | **fixed**: `cds.deploy.resources` |
| F8 | handlers outside srv missed | **mostly fixed**: CAP's implementation rule and `server.js`; plugin code (`cds-plugin.js` of local packages) still not read |
| F9 | action parameters all `10` | **fixed**: value per type |
| F10 | personal data English only | **fixed**: `@PersonalData` plus names |
| F11 | the model needs the app's npm packages when it imports CDS from packages | open: without an install the probe reports the compile error in `project.json` |
| F12 | without an install, plugin config (e.g. `@cap-js/sqlite` adds `cds.requires.db`) is missing | open by design: CI installs first; locally the text fallback fills the database box |
| F13 | routes added in `server.js` (`cds.on('bootstrap', app => app.post(...))`) are read as a file but not listed as endpoints | open |
