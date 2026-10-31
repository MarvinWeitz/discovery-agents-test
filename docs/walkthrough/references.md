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
| personal data annotations | [Annotating Personal Data](https://cap.cloud.sap/docs/guides/data-privacy/annotations) → @PersonalData (IsPotentiallyPersonal, IsPotentiallySensitive) | – | model.js `personalFields`, authz.js |

## Runtime

| Decision | CAP docs | @sap/cds source | Used in |
|---|---|---|---|
| which file implements a service: `@impl`, else `<name>.js` next to the `.cds` file | [Serving Provided Services](https://cap.cloud.sap/docs/node.js/cds-serve) → .with (impl) | `lib/srv/factory.js` (`_sibling`: also `lib/` and `handlers/` subfolders, `.ts` only with `CDS_TYPESCRIPT`; then `cds.requires.<srv>.impl`) | probe.js `implOf` |
| custom `server.js` (root, else srv folder; `server.ts` in a TypeScript run) | [Bootstrapping Servers](https://cap.cloud.sap/docs/node.js/cds-server) → Custom server.js; Lifecycle Events → bootstrap | `bin/serve.js` `_local_server_js` | probe.js `server` |
| TypeScript implementations | [Using TypeScript](https://cap.cloud.sap/docs/node.js/typescript) → Using cds-tsx; Testing with ts-jest (`CDS_TYPESCRIPT`) | `lib/srv/factory.js` `exts` | probe.js `implOf` |
| tests under `cds.test` (NODE_ENV=test → `test` profile) | [Testing with cds.test](https://cap.cloud.sap/docs/node.js/cds-test) → cds.test(); Dos and Don'ts | `lib/test/` | probe.js `test` profile, generated tests |

## Data

| Decision | CAP docs | @sap/cds source | Used in |
|---|---|---|---|
| CSV seed files: `db/data`, `test/data`, any `data/` (and legacy `csv/`) next to model files; `.csv`, `.json`; `_texts` handling | [Using Databases](https://cap.cloud.sap/docs/guides/databases) → Providing Initial Data; Location of CSV Files | `lib/dbs/cds-deploy.js` `deploy.resources` | cap.js `seedFiles` |
| HDI source folders (`src/`, `cfg/`, `.hdiconfig`) | SAP HANA Deployment Infrastructure: `@sap/hdi-deploy` package README (npm page could not be fetched on 2026-10-31; check the README in `node_modules/@sap/hdi-deploy` of an app that uses it) | – | layout.js `hdiDirs` |

## Where the docs and the code differ (checked 2026-10-31)

- **Implementation lookup:** the docs name only `@impl` and the sibling `.js`. The code also looks in `lib/` and `handlers/` next to the `.cds` file and uses `cds.requires.<srv>.impl`. The probe follows the code.
- **server.js:** the docs say `./server.js` or `./srv/server.js`. The code uses the configured srv folder, not a fixed `srv/`. The probe follows the code.
- **Service info:** `cds.compile.to.serviceinfo` is used by cds tooling but is not on the docs pages. If it changes, the fallback rule in `model.js` `servicePath` still runs.
