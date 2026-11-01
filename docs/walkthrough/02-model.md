---
piece: 2 of 13
title: Compile the CDS model into the graph
code: lib/extract/model.js, lib/project/layout.js, lib/graph.js
runs: bin/discover.js (first step), and again in bin/atlas-facts.js (same folders)
---

# Piece 2: Compile the CDS model

Goal: turn the app's CDS model into graph nodes and edges, with every fact pointing at `file:line`. Nothing here is guessed: the CAP compiler does the parsing, and this step only reads the compiled result (CSN).

## Decisions, in run order

### D1. Compile with CAP's own compiler
- **What:** `cds.load(<db>, <srv>, <app>, { locations: true })` with the toolkit's own `@sap/cds` (9.x). It does not use the app's copy.
- **Why:** the compiler resolves `using`, `extend`, `annotate`, aspects and projections exactly as the app's runtime does. `locations: true` adds `$location` (file, line) to every definition, and that becomes the evidence.
- **Folders:** the db, srv and app folder names come from `cds.env.folders` for the app root (`lib/project/layout.js`). CAP fills that from `package.json` `cds.folders`, `.cdsrc.json`, `.cdsrc.yaml` and profiles, and falls back to `db/`, `srv/`, `app/`. The order db → srv → app decides the order of definitions in the CSN, and so the order of nodes in the graph.
- **Assumes:**
  - The model compiles with cds 9. Syntax that is removed in 9, or that only a newer compiler knows, stops this step.
  - Packages the model imports with `using ... from '<package>'` are installed (see piece 1).
  - Models that CAP loads from other places are **not** included: `cds.requires.<x>.model`, plugin models, `cds.env.roots` other than db/srv/app (CAP also knows `schema`, `services`, `app/*`). Entities that only these define are missing unless db, srv or app files import them.

### D2. Skip what the app does not own
- **What:** a definition with no `$location`, or whose file path contains `node_modules`, is skipped. Elements are skipped the same way.
- **Why:** `@sap/cds/common` (Countries, Currencies, Languages) and reuse packages would flood the graph with facts the app did not write.
- **Effect:** an entity from a reuse package that the app projects on still appears as the target of a `projects_on` edge only when that package is inside the repo (path not under `node_modules`).

### D3. Imported APIs become one node
- **What:** a service annotated `@cds.external` (written by `cds import` from an EDMX or OpenAPI file) becomes one `ExternalService` node `remote:<name>`, with a count of its entities. Its entities, actions and elements are not added.
- **Why:** they describe someone else's API that the app consumes, not what it serves.

### D4. Services
- **Node** `service:<name>` with its OData path.
- **Path:** what CAP computes with `cds.compile.to.serviceinfo` in the probe (`run/project.json` `services`), so `@path`, `@protocol`, `cds.env.protocols` and the cds version's defaults all count. Every protocol is kept in `protocols`; `path` is the OData endpoint, else the first one. In a project with a `pom.xml` CAP also lists Java paths; only the Node.js ones are used.
- **Fallback** when the probe has no answer: `@path`, else `@odata` when it is a string, else `/odata/v4/` + the service name in kebab case without `Service`.
- The path is used in piece 5 to match UI5 data sources and in piece 10 for requests.
- **Roles:** `@requires` gives one `requires` edge per role with grant `*`. Each `@restrict` entry gives one edge per role in `to` (default `any`), with `grant` (default `*`, a list is joined with commas) and `where`.

### D5. Entities
- **Node id:** `svcentity:<name>` when the entity is inside a service, `remote:` when inside an external service, otherwise `entity:<name>`.
- **Props read from CSN:** draft (`@odata.draft.enabled`), auto-exposed (`@cds.autoexposed`, read from the linked model), readonly (`@readonly`), number of `@UI.*` annotations, element names, keys (without `IsActiveEntity`), the projection source, `@cds.persistence.exists` (and `calcview`).
- **"Generated":** a `.texts` entity, or a service entity that is neither a projection nor a query (CAP adds these for drafts and auto-exposure).
- **"Code list":** has elements `code`, `name` and `descr` (the shape of `sap.common.CodeList`). An own code list with other element names is not recognised.
- **Edges:** `exposes` from the service, `projects_on` to the source entity, `composes` / `associates` for each element with a target that the app owns (with element name and to-many flag).

### D6. Elements worth testing
- **What:** an `Element` node is created only for elements of persisted entities (not service entities, not `.texts`) that carry a constraint: enum, length, precision, scale, default, not null, calculated (`value`), or an annotation starting `@assert`, `@mandatory`, `@readonly`, `@Core.Immutable` or `@insertonly`. Key alone, or the length of a UUID, does not count.
- **Why:** these are the inputs for equivalence classes (piece 8). Elements inherited from aspects (no own `$location`) are skipped, so `managed` and `cuid` fields do not repeat on every entity.
- **Gap:** constraints placed on the service projection (`annotate TravelService.Travel with { x @mandatory }`) are not Element nodes. Piece 4 still sees them as UI or framework rules.

### D7. Actions, functions, events
- Bound actions become `action:<entity>.<name>` with a `has_action` edge. Unbound ones become `action:<service>.<name>`.
- Each event becomes `event:<name>` with its payload element names and a `declares_event` edge from its service.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| model files = `cds.resolve('*')` in the app folder (roots, `cds.requires.*.model`, plugin models) | lib/project/cap.js `modelFiles` | – (fallback: db, srv, app folders) |
| compiler = toolkit's `@sap/cds` 9.x | package.json of the toolkit | apps that need cds 7 or 8 syntax may fail |
| skip definitions without `$location` or under `node_modules` | model.js `isExternal` | reuse packages vendored inside the repo count as the app's own |
| `@cds.external` = imported API | model.js `remoteOf` | – |
| service path = CAP's `serviceinfo` (Node.js runtime) | model.js `servicePathOf` | – (fallback rule `servicePath`) |
| code list = includes `sap.common.CodeList`, or has `code`, `name`, `descr` | model.js `isCodeList` | – |
| action parameter types, following derived types to `cds.*` | model.js `paramTypes` | – |
| personal data = `@PersonalData.IsPotentiallyPersonal/Sensitive` | model.js `personalFields` | – |
| `@restrict` defaults: `to: any`, `grant: *` | model.js `roles` | – |
| generated = `.texts`, or a service entity without projection/query | model.js | – |
| code list = has `code`, `name`, `descr` | model.js | own code lists with other names are treated as master data |
| constraint annotations: `@assert*`, `@mandatory`, `@readonly`, `@Core.Immutable`, `@insertonly` | model.js `constraints` | other validation annotations are ignored |
| keys exclude `IsActiveEntity` | model.js | – |

## Output
Graph nodes `Service`, `Role`, `ServiceEntity`, `Entity`, `Element`, `Action`, `Event`, `ExternalService`, and edges `requires`, `exposes`, `projects_on`, `composes`, `associates`, `has_element`, `has_action`, `declares_event`. All have `source: tool:csn`, `confidence: high`, and `file:line` evidence. The compiled CSN is also returned and passed to pieces 3, 4 and 5.

The probe compiles the model once, with the app's own compiler, and discover keeps it as `run/csn.json` (with `$sources`), so later steps (`bin/atlas-facts.js`) read the same model instead of compiling again. It also writes the OData metadata per service with `cds.compile.to.edmx` to `run/edmx/<Service>.xml`: the `$metadata` document the UI really receives, with every annotation as the Fiori elements app sees it. Piece 4 (D7b) reads it to check that every UI promise reaches the UI and to add the promises only `$metadata` shows.
