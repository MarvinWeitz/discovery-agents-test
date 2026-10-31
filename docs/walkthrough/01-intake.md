---
piece: 1 of 12
title: Intake (clone, detect, install, repair, start)
code: .github/workflows/discover.yml, lib/project/detect.js (rules) + .github/scripts/detect.js (CLI), .github/scripts/repair-install.js, .github/scripts/node-test.js
runs: GitHub Actions only. bin/pipeline.js skips all of this; you pass it the paths yourself.
---

# Piece 1: Intake

Goal: find the CAP app in any GitHub repo and make it startable in a test, without editing the app's files.

## Decisions, in run order

### D1. Normalise the input to `owner/repo`
- **What:** strips `https://`, `www.`, `github.com/`, `.git`, trailing `/`, and `/tree/…` or `/blob/…`. It then requires `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`.
- **Why:** people paste whatever is in the browser bar. The strict pattern also stops shell injection through the input.
- **Assumes:** the repo is on **github.com**. GitLab, Bitbucket and GitHub Enterprise hosts are rejected.

### D2. Public or private, and where results go
- **What:** `git ls-remote` without credentials. If that works, the repo is public. Otherwise it retries with the `DISCOVERY_REPO_TOKEN` secret, and if that works the repo is private. If this repo is public, private targets are refused.
- **Publishing:** pull requests get an artifact preview. `publish=none` gets an artifact. A private repo never goes to Pages; it gets an artifact. Everything else goes to Pages.
- **Why:** logs and artifacts of a public repo are public, so private code must never pass through them.
- **Assumes:** one token for all private targets, with Contents: read.

### D3. Clone with `--filter=blob:none`, then check out the ref, then the submodules
- **Why:** a partial clone is fast on large repos, but the full history is still there for churn (piece 5). Submodules are needed for monorepos such as capire/samples. A submodule that fails gives a warning, not an error.
- **Assumes:** submodules are reachable with the same credentials.

### D4. Find the app folder (`lib/project/detect.js`)
- **What:** walks the repo and keeps folders where (a) `package.json` lists `@sap/cds` in dependencies or devDependencies, or has a `cds` key, **and** (b) its srv or db folder exists (folder names read from that project's cds config, so `"cds": {"folders": {"srv": "service/"}}` is respected), or a `.cdsrc.json` file is next to it. The shallowest one wins. On a tie, the one with `srv/` wins.
- **Why shallowest:** in a monorepo the root is usually the main app and sub-folders are reuse packages. Sample repos also nest exercise copies deeper.
- **Why `srv/` or `db/`:** without a model folder, a package that merely depends on cds (for example, a plugin or a UI package) would count.
- **Override:** the `app_path` input skips detection.
- **Known wrong picks:** a repo with several equal apps at the same depth (picks one by sort order).

### D5. Find where to install
- **What:** goes upwards from the app to the first folder with a lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `npm-shrinkwrap.json`) **or** a `workspaces` list that includes the app.
- **Why:** in a workspace monorepo, installing inside the sub-folder breaks the hoisted dependencies.
- **Workspace globs understood:** an exact path, `*`, and `dir/*` only. `**` or negations are not understood, and the install then falls back to the app folder.

### D6. Find UI5 apps outside `<app>/app`
- **What:** any folder with `webapp/manifest.json` that is **inside the install root** but not under `<app>/app/`.
- **Why inside the install root:** exercise repos (CodeJam) hold many unrelated UIs that belong to other solutions.
- **Override:** `ui_paths`. `-` means none (used for capire/samples, where the UIs belong to other apps).
- **Assumes:** standard UI5 layout `webapp/manifest.json`. A UI5 app with another `sourcePath` in `ui5.yaml` is not found.

### D7. Package manager
- **What:** `pnpm-lock.yaml` → pnpm, else `yarn.lock` → yarn, else npm.
- **Assumes:** only one lockfile. If there are several, pnpm wins over yarn.

### D8. Flags for later steps
| Flag | Rule | Used for |
|---|---|---|
| `ts` | any `.ts` (not `.d.ts`) file under `<app>/srv`, searched 6 levels deep | generate cds-typer models, install `tsx` |
| `typer` | `@cap-js/cds-typer` in dependencies | run `cds-typer "*"` |
| `jest` | `jest` in the app's own dependencies | use the app's own Jest and config |
| `curated` | a file `curated/*.json` whose `META.app` equals `owner/repo` (case-insensitive) | agent findings (piece 12) |
| `mockauth` | `cds.requires.auth` kind is `xsuaa`, `ias` or `jwt` (in package.json or .cdsrc.json) **and** there is no `[development]` or `[test]` auth profile | set `CDS_REQUIRES_AUTH_KIND=mocked` |

- **Why mock auth:** such apps need a bound XSUAA instance to start. CAP's mocked users are what its own development profile would use. Role checks still run.
- **Gaps:** auth set in `cds.env` through environment variables, `default-env.json` or other profile names (for example `[hybrid]`) is not seen.

### D9. Install, and tolerate failure
- **What:** a frozen install (`npm ci`, `--frozen-lockfile`), falling back to a normal install. Then `better-sqlite3` is rebuilt if its native build was skipped (for example by `ignore-scripts` in `.npmrc`).
- **Why tolerate failure:** pieces 2 to 9 compile the model with the toolkit's own `@sap/cds`, so most apps can still be mapped when the install fails. Running the tests always needs the installed app.
- **Exception:** a model that imports CDS from npm packages (`using ... from '@sap/cds-common-content'`, `'@cap-js/sdm'`, `'@capire/bookshop'`) needs those packages in `node_modules`. If the install failed, the compile in piece 2 stops. Seen on CodeJam, Poetry Slam and bookstore.
- **Assumes:** public npm, or registries that need no credentials. **Private registries fail** (for example `@capire/*` on GitHub Packages).

### D10. Add the test runtime without touching the app
- **What:** a `node_modules` folder **above** the clone. Node finds packages there by walking upwards. It adds whatever the app lacks of:
  - `@sap/cds@9`, only if the install failed. **9 is a fixed default.**
  - `@cap-js/sqlite` version 2 for cds 9 or later, otherwise version 1
  - `@cap-js/cds-test`, for cds 9 or later
  - `jest@29`
  - dependencies that `repair-install.js` found missing
- **Why outside the app:** the app's files stay exactly as in the repo, and nothing the run does can leak into a diff.
- If the app has no Jest, Jest is run with the config `{"testEnvironment":"node"}`.

### D11. `repair-install.js`
1. **One `@sap/cds`:** any nested copy of `@sap/cds` (up to 3 folders deep from the install root) that is not the app's own copy is replaced by a link to it. **Why:** CAP keeps the model in a per-process singleton. A second copy sees an empty model (bookstore: `cds.entities is not a function`).
2. **Missing dependencies:** for every installed package, any non-optional dependency it declares that cannot be resolved is printed. The workflow then installs it. Dependencies from file, link, workspace, git or URL are skipped. **Why:** some published lockfiles drop dependencies (Poetry Slam: `fecha`).

### D12. Generate API clients
- **What:** runs every command in the app's `package.json` scripts that contains `openapi-generator`.
- **Why:** SAP Cloud SDK clients are often gitignored and generated before the build (Poetry Slam). Other code generators (for example `cds import`, OData generators) are **not** run.

### D13. Startup probe
- **What:** writes `test/discovery-startup/startup.test.js`, which runs `cds.test(<app>, '--with-mocks')` and passes if at least one `ApplicationService` is served.
- **Why `--with-mocks`:** required remote services without credentials are served as local mocks instead of failing.
- **Fallback:** if Jest fails, it retries with Node's own test runner (`node-test.js`). Jest's module sandbox breaks cds 10 and some SAP Cloud SDK loggers.
- **Result:** if startup fails, the generated tests (piece 10) are skipped. The atlas is still built.
- **Assumes:** the default `cds.test` profile with SQLite in memory. **HANA-only** artifacts (calculation views, procedures) do not exist there.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| github.com only | discover.yml plan step | other hosts rejected |
| `ubuntu-latest`, Node `22.x` | discover.yml | apps needing Node 18 or 20 behaviour may differ |
| Playwright `1.63.0` | discover.yml env | – |
| 45 min job timeout | discover.yml | very large apps cut off |
| skipped folders: `node_modules .git gen dist mta_archives resources` and all dot folders | lib/project/detect.js `SKIP_DIRS` | an app inside `resources/` is never found |
| walk depth 6 | `MAX_DEPTH` | an app deeper than 6 levels is not found |
| app = `@sap/cds` dependency or `cds` key **+** its srv or db folder (names from its cds config, default `srv/`, `db/`) or `.cdsrc.json` | lib/project/detect.js `isCapProject` | non-standard folder names without `.cdsrc.json` are missed |
| shallowest wins, then has `srv/` | `findApp` | multi-app repos need `app_path` |
| lockfile names (4) and workspace globs `x`, `*`, `x/*` | `LOCKFILES`, `installRoot` | install in the wrong folder |
| UI5 app = `webapp/manifest.json` | `uiProjects` | custom source paths missed |
| UIs counted only inside the install root, not under `<app>/app` | `uiProjects` | – |
| pnpm > yarn > npm | `packageManager` | – |
| TypeScript = `.ts` under the srv folder | `hasTypeScript` | TS handlers elsewhere not flagged |
| mock auth needed = auth kind `xsuaa`, `ias` or `jwt` in CAP's `test` profile (probe); text of `[development]`/`[test]` only as fallback | `needsMockAuth`, `TOKEN_AUTH` | – |
| `@sap/cds@9` fallback, sqlite 2 for cds ≥ 9 else 1, `jest@29` | discover.yml shim step | cds 7 or 8 apps get mismatched runtimes only if the install failed |
| nested cds search depth 3 | repair-install.js | deeper copies stay |
| only `openapi-generator` scripts run | discover.yml | other generators not run |
| startup test timeout 120 s, Jest `--forceExit` | discover.yml | slow startups fail |
| startup pass = ≥ 1 `ApplicationService` served | startup.test.js | – |
| 6 pilot repos with pinned commits; `gate:false` makes one report-only | discover.yml `PILOTS` | only affects PR checks |

## Output
Key=value lines in `$GITHUB_OUTPUT`: `app, ui, install, pm, ts, typer, jest, curated, mockauth`, plus `dir, slug, commit, visibility, publish, atlas_url` from the clone. There are no files except the startup test and the runtime folder above the clone.
