# Pilot apps

Discovery is tuned against six public SAP samples. The first three gate every pull request; the last three are harder and report without failing the check until their runtime tests are green (`"gate": false` in `PILOTS`, `.github/workflows/discover.yml`).

| Pilot | Commit | What it stresses | Gate |
| --- | --- | --- | --- |
| [cap-js/incidents-app](https://github.com/cap-js/incidents-app) | default branch | basics: draft, `@restrict`, one handler file | yes |
| [SAP-samples/cap-sflight](https://github.com/SAP-samples/cap-sflight) | `7f42e85` | TypeScript + cds-typer, status machine, many UI rules | yes |
| [SAP-samples/ui5-cap-event-app](https://github.com/SAP-samples/ui5-cap-event-app) | default branch | monorepo, freestyle UI5 projects next to the server | yes |
| [SAP-samples/cap-hana-exercises-codejam](https://github.com/SAP-samples/cap-hana-exercises-codejam) `solution/MyHANAApp` | `b3daa04` | calculation view behind `@cds.persistence.exists`, stored procedure called with `db.run`, xsuaa-only auth | no |
| [capire/samples](https://github.com/capire/samples) `bookstore` | `5a89af6` | reuse packages from a workspace with submodules, handlers on other services, events between services, model per database profile | no |
| [SAP-samples/partner-reference-application](https://github.com/SAP-samples/partner-reference-application) (Poetry Slam Manager, branch `main-multi-tenant-features`) | `63ecfe4` | implementation split over 6 files, S/4HANA, ByD and B1 APIs, HANA sequence with a SQLite fallback | no |

## What the harder pilots exposed, and the fix

| Gap | Seen in | Before | After |
| --- | --- | --- | --- |
| Handler files loaded by the service class (`await slamsHandler(this)`) had no service | Poetry Slam | 37 of 37 handlers without service, 30 "no handler" risks | 0 without service; the 1 left is real (`extendProjectData`, an extension point) |
| Imported APIs (`@cds.external`, `cds import`) counted as served OData services | Poetry Slam | 4 false "no @requires" risks, their actions in the "no handler" list | consumed as `ExternalService`, projections point at them |
| Handlers registered on another service (`cds.connect.to` + `on` / `prepend`) | bookstore | 4 handlers without service or target | registered on `CatalogService`, `ReviewsService`, `OrdersService` |
| Events of other services that change local data | bookstore | not seen | `subscribes` edges, written entity and where clause; risk when no test emits them |
| Calls to other and remote services (`Reviews.read`, `s4.run`, constants like `ConnectorS4HC.PROJECT_SERVICE`) | bookstore, Poetry Slam | not seen | `calls_service` edges, followed through imported connector modules into the slice |
| HANA-native objects | CodeJam, Poetry Slam | listed, linked to nothing | calc view → tables it reads, entity → calc view, procedure and sequence → code that calls them |
| Native SQL and `switch (db.kind)` | CodeJam, Poetry Slam | not seen | facts per file:line; risks for HANA-only statements and untested branches |
| Model per profile (`db/hana` vs `db/sqlite`) | bookstore | not seen | `DbVariant` facts; risk that tests run the other model |
| `@(odata: '/admin')` service path | bookstore | 3 UI apps not linked to their service | linked |
| Services with only actions (job scheduler) and virtual entities with handlers | Poetry Slam | outside every slice | own slice |

Slice coverage (share of model and code facts that land in a slice):

| Pilot | Before | After | Risks before → after |
| --- | --- | --- | --- |
| CodeJam | 81 % | 96 % | 3 → 5 (adds HANA-only paths, native SQL) |
| bookstore | 55 % | 72 % | 8 → 5 (drops 3 false "no handler", adds events and remote calls) |
| Poetry Slam | 41 % | 99 % | 40 → 10 (drops 33 false positives, adds sequence, native SQL, db branch) |
| incidents, SFlight, event app | unchanged | unchanged | unchanged (graphs identical) |

Unit tests for these cases: `test/extractors.test.js` (`node --test 'test/*.test.js'`, workflow `unit.yml`).

## Still open

- Reuse services that run as separate apps (bookstore's reviews and orders) are analysed as remote only; run discovery on each of them for their own handlers.
- `cds.connect.to(variable)` with a runtime value (Poetry Slam's generic `connector.js`) stays unresolved.
- No pilot uses a message broker topic yet (`messaging.on('topic')`); the extractor handles it like any connected service.
- The new risks describe their test; generating those tests (event emit, remote mock, HANA-profile run) is the next step.
