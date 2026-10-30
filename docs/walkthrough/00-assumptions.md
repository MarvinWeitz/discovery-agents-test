---
title: Every assumption the pipeline makes, and where to change it
scope: pieces 1 to 12 of the walkthrough
---

# Assumptions index

When a new repo breaks something, look here first: each line names the assumption, the one place in the code that decides it, and the walkthrough piece that explains it.

## Where things are (`lib/project/`)

All folder and config knowledge sits in `lib/project/`. Other modules ask it; none of them names a folder themselves.

| Assumption | Decided in | Today | Piece |
|---|---|---|---|
| db, srv and app folder names | `layout.js` (from `cds.env.folders`) | the app's own CAP config, default `db/ srv/ app/` | 2 |
| CDS model = db + srv + app folders, in that order | `layout.js` `modelDirs` | other roots and `cds.requires.*.model` are not compiled | 2 |
| CDS source text search order app → srv → db | `layout.js` `cdsSourceDirs`, `sources.js` | – | 4, 5f |
| handlers live in the srv folder (+ `@impl` outside) | `layout.js` `handlerDirs` | – | 3 |
| UI5 projects under the app folder + `--ui` | `layout.js` `uiRoots` | – | 5a |
| HDI sources in `<db>/src` | `layout.js` `CONVENTIONS.hdiSource` | – | 5b, 5g |
| CSV seed data in `<db>/data`, `<db>/csv`, `test/data` | `layout.js` `CONVENTIONS.seedData` | – | 8 |
| ignored sample folders `xmpls` | `layout.js` `CONVENTIONS.ignored` | cap-sflight specific | 5d, 5f |
| layer of a file = its folder | `layout.js` `layerOf` | – | 5f |
| config files read as text: `package.json` "cds", `.cdsrc.json` | `config.js` `FILES` | `.cdsrc.yaml`, `.cdsrc-private.json` and env vars only through `config.env()` | 5b, 5c |
| deployment descriptors `mta.yaml`, `xs-security.json`, `app/router/xs-app.json` | `config.js` `DESCRIPTORS` | – | 5b |
| walks skip `node_modules` and dot folders | `files.js` `SKIP` | – | all |
| app detection in a cloned repo (skip list, depth 6, lockfiles, workspaces, token auth) | `detect.js` | – | 1 |

## What the code is assumed to look like

| Assumption | Decided in | Piece |
|---|---|---|
| CAP words: CRUD events, CQL verbs, phases, non-service receivers, remote call methods, SQL and HANA-only keywords, database kinds | `lib/extract/handlers/vocabulary.js` | 3 |
| which file implements which service (class name, `@impl`, sibling `.cds`, base name, split implementations) | `lib/extract/handlers/binding.js` | 3 |
| entity aliases from `.entities`, `cds.entities(ns)`, `#cds-models/` | `lib/extract/handlers/names.js` | 3 |
| OData path rule (`@path`, `@odata`, `/odata/v4/<kebab>`) | `lib/extract/model.js` `servicePath` | 2 |
| code list = has `code`, `name`, `descr` | `lib/extract/model.js` | 2 |
| UI promises = OperationAvailable, FieldControl, Create/DeleteHidden, SideEffects, readonly, mandatory, assert.range | `lib/analyse/reflexion-ui.js` | 4 |
| one status domain per app | `lib/analyse/reflexion-ui.js` | 4 |
| personal data = English field names | `lib/analyse/authz.js` `PII` | 7 |
| status column = `<field>_code` | `lib/analyse/test-design.js` | 8 |
| tests found by `*.test|spec.js|ts` and `*Journey.js`; "mentions" by name | `lib/extract/tests.js` | 5d |
| remote / broker kinds | `lib/extract/config.js` | 5b |

## Scores and thresholds

| Value | Decided in | Piece |
|---|---|---|
| slice weights churn 0.3, centrality 0.25, external 0.2, events 0.15, criticality 0.1; criticality fixed 0.5 | `lib/analyse/slices.js` | 6 |
| split slices above 8 handlers; association depth 4 | `lib/analyse/slices.js` | 6 |
| impact × likelihood per risk rule | `lib/analyse/risks.js` | 9 |
| all-pairs seed 7, 40 tries | `lib/analyse/test-design.js` | 8 |
| next steps P1 ≥ 16, P2 ≥ 9 | `addons/nextsteps` | 11 |

## Open fixes (known wrong or incomplete, kept so this change gives the same output)

| # | What | Where | Fix |
|---|---|---|---|
| F1 | FieldControl path root skips `to_Travel` (cap-sflight name) | `lib/analyse/reflexion-ui.js` D4 | skip any navigation segment (an element with a target) |
| F2 | conditional-write coverage looks for the word `discount` (cap-sflight) | `lib/analyse/test-design.js` | use the written field names |
| F3 | docs addon strips `travel.` and `TravelStatusCode.` from guards (cap-sflight) | `addons/docs/docs.js` `plain` | strip the handler's own entity and enum names |
| F4 | report strips `sap.capire.<x>.` from ids (capire samples) | `lib/report/report.js` `short` | strip the app's own namespace |
| F5 | remote services and brokers read from `package.json` only | `lib/extract/config.js` | read `config.env(root).requires` |
| F6 | model roots other than db/srv/app, and `cds.requires.*.model`, are not compiled | `lib/project/layout.js` `modelDirs` | use `cds.resolve('*')` |
| F7 | CSV seed data next to other model files is not read | `lib/project/layout.js` `seedDirs` | follow CAP's `data/` and `csv/` rule per model folder |
| F8 | handlers outside the srv folder (server.js, plugins, lib) are missed unless required | `lib/project/layout.js` `handlerDirs` | follow `require`s from `server.js` and `cds-plugin.js` |
| F9 | action parameters in generated tests are all `10` | `bin/gen-tests.js` `bodyFor` | pick a value per parameter type from the CSN |
| F10 | personal-data detection is English only | `lib/analyse/authz.js` | add `@PersonalData` annotations and more names |
| F11 | the pipeline needs the app's npm packages when the model imports CDS from packages | piece 1 D9 | report it clearly in the atlas instead of failing |
