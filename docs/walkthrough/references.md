---
title: Where each decision comes from, and where to look when CAP changes
checked: 2026-10-31 against @sap/cds 9.9.4 (toolkit) and cap.cloud.sap/docs
---

# References

For each decision that follows CAP, this page names the CAP documentation section and the `@sap/cds` source file that hold the rule. When a new cds version comes out, check its release notes for these pages and files, then rerun the pilots.

- **Release notes:** https://cap.cloud.sap/docs/releases/
- **Source of truth for the code:** `node_modules/@sap/cds/` in the app (the probe uses the app's own copy when it is installed). The paths below are for 9.9.4.
- Section names are the page headings. Link fragments are left out, because they change more often than the headings do.

## Configuration

| Decision | CAP docs (page → section) | @sap/cds source | Used in |
|---|---|---|---|
| effective config, sources and their order (`package.json`, `.cdsrc.json`, `.cdsrc-private.json`, `.env`, `CDS_CONFIG`, env variables, `VCAP_SERVICES`) | [Project-Specific Configurations](https://cap.cloud.sap/docs/node.js/cds-env) → Sources for cds.env; CLI cds env | `lib/env/cds-env.js` (`for`, `_add_static_profiles`) | probe.js `envFor` |
| profiles (`[development]`, `[production]`, NODE_ENV, CDS_ENV; `java` added when a `pom.xml` exists) | same page → Configuration Profiles | `lib/env/cds-env.js` lines 35–44 | probe.js (development, test, production) |
| default folders and roots | same page → `cds env ls folders` | `lib/env/defaults.js` `folders` (order matters for `cds.load('*')`) | layout.js, probe.js |
| `cds.requires.<srv>.kind`, `.impl`, `.model`, `.credentials` | [Connecting to Required Services](https://cap.cloud.sap/docs/node.js/cds-connect) → Configuring Required Services | `lib/env/cds-requires.js` | extract/config.js |
| remote API kinds (`odata`, `odata-v2`, `rest`) | [Consuming Services](https://cap.cloud.sap/docs/guides/using-services) → Import API Definition; Supported Protocols | `lib/env/cds-requires.js` (`kinds`) | extract/config.js `REMOTE_KINDS` |
| messaging kinds (`file-based-messaging`, `enterprise-messaging`, `composite-messaging`, …) | [Events and Messaging](https://cap.cloud.sap/docs/guides/messaging/) → Using Message Channels | `lib/env/cds-requires.js` | extract/config.js `BROKER_KINDS` |
| auth kinds, mocked users, `restrict_all_services` | [Authentication](https://cap.cloud.sap/docs/node.js/authentication) → Mocked Authentication; Pre-defined Mock Users; Enforced by Default | `lib/env/cds-requires.js` (`auth` presets) | extract/auth.js, detect.js `needsMockAuth` |
| `cds env` CLI | [CDS CLI](https://cap.cloud.sap/docs/tools/cds-cli) → cds env | `@sap/cds-dk` | (the probe calls the same API in code) |

## Model

| Decision | CAP docs | @sap/cds source | Used in |
|---|---|---|---|
| which files form the model (`cds.resolve('*')`) | [Parsing and Compiling Models](https://cap.cloud.sap/docs/node.js/cds-compile) → cds.resolve(); cds.load(files) | `lib/compile/resolve.js`, `lib/compile/load.js` | cap.js `modelFiles` |
| service info: URL path and protocols per service | not documented as a public API; paths: [Serving Provided Services](https://cap.cloud.sap/docs/node.js/cds-serve) → .at (path); cds.protocols; @path; @protocol | `lib/compile/to/srvinfo.js`, `lib/srv/protocols/index.js` (`endpoints4`) | model.js `servicePathOf` |
| code lists (`sap.common.CodeList`) | [Common Types and Aspects](https://cap.cloud.sap/docs/cds/common) → Common Code Lists; Aspect CodeList | `common.cds` | model.js `isCodeList` |
| `annotate` / `extend` per file, with target and line | [Parsing and Compiling Models](https://cap.cloud.sap/docs/node.js/cds-compile) → cds.parse.cdl() | `lib/compile/parse.js` (calls `@sap/cds-compiler` `parse.cdl`) | cds-deps.js `extensionsOf` |
| the compiled model, reused by later steps | same page → cds.load(); [CSN](https://cap.cloud.sap/docs/cds/csn) | `lib/compile/load.js` | probe.js → `run/csn.json`, cap.js `compiledModel` |
| OData metadata per service (what the UI receives as `$metadata`) | same page → cds.compile.to.edmx(); [Serving OData APIs](https://cap.cloud.sap/docs/advanced/odata) | `lib/compile/to/edm.js` | probe.js → `run/edmx/<Service>.xml` |
| conditions as data (CXN) | [CXN](https://cap.cloud.sap/docs/cds/cxn); [Parsing](https://cap.cloud.sap/docs/node.js/cds-compile) → cds.parse.expr() | `lib/compile/parse.js` | conditions.js, handlers/body.js, reflexion-ui.js |
| builtin types | [Reflection](https://cap.cloud.sap/docs/node.js/cds-reflect) → cds.linked, `_type` | `lib/linked/` | model.js `builtin` |
| SQL names of entities | [Databases](https://cap.cloud.sap/docs/guides/databases) → Naming Mode (`sql_mapping`) | `@sap/cds-compiler` `getArtifactCdsPersistenceName` | probe.js → `sqlNames`, native.js |
| what the UI receives: `$metadata` annotations | [Serving OData APIs](https://cap.cloud.sap/docs/advanced/odata); Fiori tools libraries `@sap-ux/edmx-parser`, `@sap-ux/annotation-converter` (github.com/SAP/open-ux-odata) | – | metadata.js |
| Capabilities restrictions answered with 405; Core.Computed / ReadOnly ignored on input | [Providing Services](https://cap.cloud.sap/docs/guides/providing-services) → @readonly, @insertonly; Input Validation | `libx/_runtime/common/generic/auth/capabilities.js`; `lib/req/validate.js` (163–164) | metadata.js verdict `framework` |
| personal data annotations | [Annotating Personal Data](https://cap.cloud.sap/docs/guides/data-privacy/annotations) → @PersonalData (IsPotentiallyPersonal, IsPotentiallySensitive) | – | model.js `personalFields`, authz.js |

## Runtime

| Decision | CAP docs | @sap/cds source | Used in |
|---|---|---|---|
| which file implements a service: `@impl`, else `<name>.js` next to the `.cds` file | [Serving Provided Services](https://cap.cloud.sap/docs/node.js/cds-serve) → .with (impl) | `lib/srv/factory.js` (`_sibling`: also `lib/` and `handlers/` subfolders, `.ts` only with `CDS_TYPESCRIPT`; then `cds.requires.<srv>.impl`) | probe.js `implOf` |
| custom `server.js` (root, else srv folder; `server.ts` in a TypeScript run) | [Bootstrapping Servers](https://cap.cloud.sap/docs/node.js/cds-server) → Custom server.js; Lifecycle Events → bootstrap | `bin/serve.js` `_local_server_js` | probe.js `server` |
| plugins CAP loads at startup: `cds-plugin.js` of every dependency (devDependencies outside production) | [CDS Plugin Packages](https://cap.cloud.sap/docs/node.js/cds-plugins) | `lib/plugins.js` `fetch` (`require.resolve(each + '/cds-plugin')` from `cds.home` and `cds.root`) | probe.js `pluginImpls`, lib/project/plugins.js |
| express routes added at bootstrap | [Bootstrapping Servers](https://cap.cloud.sap/docs/node.js/cds-server) → cds.on('bootstrap'), Custom server.js | `bin/serve.js`, `server.js` | lib/extract/bootstrap.js |
| TypeScript implementations | [Using TypeScript](https://cap.cloud.sap/docs/node.js/typescript) → Using cds-tsx; Testing with ts-jest (`CDS_TYPESCRIPT`) | `lib/srv/factory.js` `exts` | probe.js `implOf` |
| every handler the app registers, with its call site | [Core Services](https://cap.cloud.sap/docs/node.js/core-services) → srv.on, before, after (Registering Event Handlers) | `lib/srv/srv-handlers.js` `EventHandlers.prototype.register` (all `srv.before/on/after/reject` end here; not a public API) | addons/runtime/record.js |
| requests the tests send, without patching | [Core Services](https://cap.cloud.sap/docs/node.js/core-services) → srv.before/after('*'), srv.on('error'); [Lifecycle Events](https://cap.cloud.sap/docs/node.js/cds-server) → served | `lib/srv/srv-handlers.js` | addons/measured/recorder.js |
| authorization answered by CAP (401, 403, 405) | [Authorization](https://cap.cloud.sap/docs/guides/security/authorization) → @restrict, @requires; [Authentication](https://cap.cloud.sap/docs/node.js/authentication) → Mocked Authentication | `libx/_runtime/common/generic/auth/` | addons/measured/authz-probe.test.js |
| tests under `cds.test` (NODE_ENV=test → `test` profile) | [Testing with cds.test](https://cap.cloud.sap/docs/node.js/cds-test) → cds.test(); Dos and Don'ts | `lib/test/` | probe.js `test` profile, generated tests |

## Data

| Decision | CAP docs | @sap/cds source | Used in |
|---|---|---|---|
| seed file parsing (CSV and JSON) | same page → Providing Initial Data | `lib/compile/parse.js` `csv` (cds.parse.csv) | seed-data.js |
| CSV seed files: `db/data`, `test/data`, any `data/` (and legacy `csv/`) next to model files; `.csv`, `.json`; `_texts` handling | [Using Databases](https://cap.cloud.sap/docs/guides/databases) → Providing Initial Data; Location of CSV Files | `lib/dbs/cds-deploy.js` `deploy.resources` | cap.js `seedFiles` |
| HDI file types per folder (`.hdiconfig` → `file_suffixes`) | `@sap/hdi-deploy` README → .hdiconfig | – | config.js `hdiSuffixes` |
| HDI source folders (`src/`, `cfg/`, `.hdiconfig`) | SAP HANA Deployment Infrastructure: `@sap/hdi-deploy` package README (npm page could not be fetched on 2026-10-31; check the README in `node_modules/@sap/hdi-deploy` of an app that uses it) | – | layout.js `hdiDirs` |

## Tests

| Decision | Docs | Source | Used in |
|---|---|---|---|
| which files are the app's tests | [Jest CLI](https://jestjs.io/docs/cli) → --listTests; [Configuring Jest](https://jestjs.io/docs/configuration) → testMatch, testPathIgnorePatterns, roots | `jest-cli` (`--listTests`), the app's own Jest | tests.js `testFiles` |
| OPA5 journeys (not run by Jest) | [UI5 OPA5](https://ui5.sap.com/#/topic/2696ab50faad458f9b4027ec2f9b884d) → Journeys; [Fiori elements test library](https://ui5.sap.com/#/api/sap.fe.test) | – | tests.js `isTest` |

## UI5 and Fiori tools

| Decision | Docs | Source | Used in |
|---|---|---|---|
| which folders are UI5 apps; which are CAP Node.js projects | `@sap-ux/project-access` README (github.com/SAP/open-ux-tools, packages/project-access) → findAllApps, getWebappPath, findCapProjects, getCapProjectType | the package | ui5apps.js, detect.js |
| UI5 event names | [UI5 TypeScript](https://sap.github.io/ui5-typescript/) → `@openui5/types` | `attach<Event>` methods in `types/*.d.ts` | ui5-events.js |

## Rules

| Decision | Docs | Source | Used in |
|---|---|---|---|
| rule format, metavariables, generic mode | [Opengrep](https://github.com/opengrep/opengrep) (Semgrep CE rule syntax: semgrep.dev/docs/writing-rules/rule-syntax) | – | addons/rules/opengrep |
| rule tests (`ruleid:` / `ok:`) | Semgrep docs → Testing rules | – | js.js, cds.cds |
| `metavariable-regex` is left-anchored | Semgrep docs → metavariable-regex ("matches from the start") | – | js.yml |

## Checked and left as they are (2026-10-31)

- **`@mermaid-js/mermaid-cli` for report diagrams:** `render-diagrams.js` already calls Mermaid's own `mermaid.render` in Playwright's Chromium; the CLI would add Puppeteer and a second Chromium for the same result.
- **`graphology` for the graph:** the slice cut and ranking follow CAP relations (compositions, projections, handlers); centrality is a degree sum. A graph library would replace a few loops, not a decision.
- **`srv.handlers` instead of wrapping `register`:** `srv.handlers` lists the handler functions but not the line that registered them, which the RTM comparison needs.
- **Joern for data flow:** not added. Opengrep's taint mode covers flows inside one handler; cross-file flow would need Joern (JVM, Apache-2.0) as an optional CI addon.

## Where the docs and the code differ (checked 2026-10-31)

- **Implementation lookup:** the docs name only `@impl` and the sibling `.js`. The code also looks in `lib/` and `handlers/` next to the `.cds` file and uses `cds.requires.<srv>.impl`. The probe follows the code.
- **server.js:** the docs say `./server.js` or `./srv/server.js`. The code uses the configured srv folder, not a fixed `srv/`. The probe follows the code.
- **Handler registry:** the docs describe `srv.on/before/after` but not where they are stored. In 9.9.4 every call ends in `EventHandlers.prototype.register(srv, phase, event, path, handler)`. If a cds version renames it, the recorder finds nothing and the RTM section stays away; nothing else breaks.
- **Service info:** `cds.compile.to.serviceinfo` is used by cds tooling but is not on the docs pages. If it changes, the fallback rule in `model.js` `servicePath` still runs.
