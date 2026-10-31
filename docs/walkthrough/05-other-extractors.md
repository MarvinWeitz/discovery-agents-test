---
piece: 5 of 12
title: UI5 apps, configuration, users, tests, history, CDS layers, HANA-native objects, lint
code: lib/extract/ui5.js, config.js, auth.js, tests.js, history.js, cds-deps.js, native.js, lint.js
runs: bin/discover.js, after pieces 2 to 4, in this order: ui5, config, auth, cds-deps, native, tests, lint, history
---

# Piece 5: The other extractors

Each extractor adds one kind of fact to the graph. None of them runs app code.

## 5a. UI5 apps (`ui5.js`)

- **Which apps:** every `webapp/manifest.json` under the app folder (from `cds.env.folders`, default `app/`) and under the extra folders from `--ui` (piece 1 finds them in monorepos).
- **App node** `ui5app:<sap.app.id>` with the minimum UI5 version, the libraries, and whether it is Fiori elements (the `sap.fe.templates` library is listed).
- **Data sources → services:** each OData data source's `uri` (slashes trimmed, one leading `/`) is matched to the service whose path (piece 2) it **ends with**. No match makes it an `ExternalService` named by its URI.
  - Assumes the UI calls the CAP service under its own path. An approuter route that rewrites the path (`/api/` → `/odata/v4/travel/`) breaks the match.
- **Routes:** each `routing.routes` entry, its first target, and the target's `entitySet` or `contextPath` (Fiori elements). The default model's data source decides the service. `navigation.*.detail.route` gives `navigates_to`.
- **Views and fragments:** each `*.view.xml` and `*.fragment.xml` in the webapp. Bindings are matched with a text pattern (`"/Entity` or `{path: '/Entity`). Event attributes `press`, `change`, `select`, `liveChange`, `search` and `submit` become `UIHandler` nodes. These are `confidence: medium`.
  - **Not covered:** JS views, controller logic, bindings built in code, i18n.

## 5b. Configuration (`config.js`)

- **Remote services:** `cds.requires.<name>` as CAP resolves it (probe: development and production profiles merged, production's kind wins; all config files, `.cdsrc.yaml`, env variables, plugins) whose `kind` matches `odata`, `rest` or `hcql`, or that CAP marks `external`, becomes an `ExternalService` with model and destination. If the app also serves a service of that name, it is marked as served remotely (a modulith or reuse service).
- **Message brokers:** `kind` or name matching `messaging`, `event-mesh`, `enterprise-messaging`, `kafka` or `redis`.
- **Evidence:** the first config file whose text names the entry (`package.json`, `.cdsrc.json`, `.cdsrc.yaml`, `.cdsrc-private.json`), else `cds env`.
- **Not services:** `db`, `auth`, `queue`, `middlewares`, `scheduling`, `outbox` (CAP's own runtime entries).
- **Descriptors:** whether `mta.yaml`, `xs-security.json` and `app/router/xs-app.json` exist in the app folder.
- **Plugins:** dependencies starting with `@cap-js/` or `@sap/cds-`.
- **HDI artifacts:** every `*.hdb*` file under a folder that holds a `.hdiconfig` (the HDI deployer's own marker; outermost wins, `gen/` skipped), else under `<db>/src`, becomes a `DbArtifact`.

## 5c. Mock users and roles (`auth.js`)

- **Users:** `cds.requires.auth.users` in `package.json` and `.cdsrc.json`, and `cds.requires["[profile]"].auth.users` for each profile. Each user keeps the profile and the line where it is defined.
- **CAP's built-in users** (alice, bob, …) are added from the effective `cds.env`, marked `capDefault`, because CAP merges them in at runtime.
- **`restrict_all_services`** comes from the effective env when it is set there, otherwise from the files.
- **Roles from XSUAA:** every `xs-security.json` anywhere under the app; `$XSAPPNAME.` is removed from scope names.

## 5d. Existing tests (`tests.js`)

- **Which files:** the app's own Jest decides. `tests.js` `testFiles` runs `jest --listTests --json` with the app's Jest (`node_modules/.bin/jest` in the app or its parent folder), so the app's `testMatch`, `roots` and `testPathIgnorePatterns` apply. OPA5 journeys (`webapp/test/**/*Journey.js`) are added, because Jest does not run them. Only when Jest is not installed: the name pattern `*.test|spec.js|ts`, skipping `node_modules`, dot folders and ignored folders (`xmpls`).
- **Per file:** number of `it(`, `test(` or `opaTest(` calls, the test names, the users they run as (`auth: { username: 'x' }` or `.auth('x')`), and the service entities they mention by **short name as a whole word**.
- **Weak:** "mentions" is text matching, so a test that mentions `Travel` in a comment counts as touching the Travel entity. This is why coverage of existing tests is called approximate everywhere.

## 5e. Git history (`history.js`)

- `git log --numstat` over the whole history: commits and changed lines per file. Used only for the churn factor in piece 6. Without git, or in a shallow clone, all files get 0.

## 5f. CDS file dependencies and layers (`cds-deps.js`)

- **Files:** the app's own `.cds` files in the compiled model (`csn.$sources` from the probe). Fallback: every `.cds` file under the app, srv and db folders, except ignored folders.
- **Layer of a file:** the folder it is in (app, srv or db). Anything else, including packages, is `ext`. The allowed direction is app → srv → db → ext.
- **Edges:**
  - `using ... from '<file>'` gives `uses`. It is `bad` when a lower layer imports a higher one.
  - `annotate` / `extend <target>` gives `annotates` / `extends`, pointing to the file that defines the target (for a service entity, the service's file).
- **Verdicts for annotate and extend:**
  - same layer: `ok`
  - `cds.*` built-in types: `bad` (changes the whole model)
  - app → db annotate: `skip` (common, but bypasses the service layer)
  - app → db extend: `bad`
  - srv → db: `bad`
  - lower → higher: `bad`
- **How `annotate` / `extend` are read:** with CAP's own parser, `cds.parse.cdl(src, {locations:true})`, which lists every extension with its target and line, also when it spans several lines. Only when the parser fails on a file: the old text pattern.
- **Still text:** the `using ... from` lines (the parser resolves them away). On all three local pilots the parser gave the same edges as the patterns did.

## 5g. HANA-native objects (`native.js`)

- **Name of an artifact:** read from its content. Calculation views give the scenario id, synonyms the first key. SQL artifacts give the name after `CREATE PROCEDURE|FUNCTION|VIEW|SEQUENCE|TABLE|TRIGGER|ROLE` (comments removed). The fallback is the file name.
- **What it reads:** calculation views give `resourceUri` entries, synonyms give `target.object`, SQL gives every name after `FROM`, `JOIN`, `INTO`, `UPDATE` or `CALL`. A name equal to an entity's SQL name (dots to `_`, upper case) gives a `reads` edge. A name equal to another artifact gives `depends_on`.
- **`@cds.persistence.exists` entities** are linked to the artifact with their SQL name or short name (`backed_by`). Without one they are marked `nativeMissing`.
- **Code that names an artifact:** any `.js`/`.ts` source file that quotes an artifact name longer than 3 characters gives `uses_native`.
- **Database model per profile:** `cds.requires.db["[profile]"].model` in `package.json` becomes a `DbVariant` per profile, with its `.cds` files.

## 5h. Lint (`lint.js`)

- **cds lint:** the toolkit's ESLint with `@sap/eslint-plugin-cds` and its own config (`eslint.cds.config.mjs`), on `<db>/**/*.cds`, `<srv>/**/*.cds` and `<app>/**/*.cds`. The app's own ESLint config is ignored on purpose, so results are comparable between apps.
- **UI5 lint:** `ui5lint` in every folder with a `ui5.yaml` under the UI roots.
- Each message becomes a `Finding` (error or warning) on its file. A linter that crashes gives `null` instead of a count. Each linter can run for up to 5 minutes. This is most of the time `discover` takes on SFlight.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| UI5 app = `webapp/manifest.json` under the app folder or `--ui` | ui5.js `isManifest`, layout.js `uiRoots` | other source layouts are missed |
| data source → service by "URI ends with service path" | ui5.js | rewritten approuter paths look like external services |
| view event attributes `press change select liveChange search submit` | ui5.js | other events are not listed |
| remote kinds `odata rest hcql`; broker kinds `messaging event-mesh enterprise-messaging kafka redis` | config.js `REMOTE_KINDS`, `BROKER_KINDS` | – |
| remote services = effective `cds.requires` (development + production) | config.js, lib/project/cap.js | – |
| descriptors `mta.yaml`, `xs-security.json`, `app/router/xs-app.json` | lib/project/config.js `DESCRIPTORS` | another approuter location is reported as missing |
| plugin = `@cap-js/*` or `@sap/cds-*` | config.js | – |
| HDI sources = folders with `.hdiconfig`, else `<db>/src` | layout.js `hdiDirs` | – |
| users = effective `cds.requires.auth` (probe, app's own cds version); file:line from `package.json`, `.cdsrc.json` | auth.js, lib/project/cap.js | users only in `.cdsrc.yaml` get `@sap/cds defaults` as evidence |
| test files: `jest --listTests`; fallback `*.test|spec.js|ts`; plus `webapp/test/**/*Journey.js` | tests.js `testFiles`, `isTest` | Mocha or Vitest suites are only found by the fallback name pattern |
| CDS files = the app's own files in the compiled model (`csn.$sources`); `xmpls` only matters in the fallback | lib/project/cap.js `cdsSources` | files the model never uses are not listed |
| layer = folder (app, srv, db), else ext | layout.js `layerOf` | a domain model under srv is judged as service layer |
| artifact name longer than 3 characters for code matches | native.js | – |
| lint timeout 5 min per linter | lint.js | big apps lose their lint findings |

## Output
Graph nodes `UI5App`, `Route`, `View`, `UIHandler`, `ExternalService`, `MessagingBroker`, `Role`, `MockUser`, `DbArtifact`, `DbVariant`, `CdsFile`, `ExistingTest`, `Finding`, and their edges. `metrics.json` gets counts for auth, CDS dependencies, native objects and lint.
