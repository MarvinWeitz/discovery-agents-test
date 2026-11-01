---
piece: 10 of 13
title: Generate cds.test suites and run them
code: bin/gen-tests.js; in CI .github/workflows/discover.yml (startup probe, test run), .github/scripts/node-test.js, .github/scripts/result.js; addons/uitests for UI tests
runs: bin/pipeline.js step "tests"; execution only in GitHub Actions
---

# Piece 10: Generated tests

Goal: turn every class from piece 8 that has a concrete request into a test that runs against the real app, in its own test runner, with no change to the app.

## Decisions, in run order

### D1. Only classes with a request become code
- Today that means authorization READ classes and UI-promise classes for actions (piece 8 D2). The other categories stay in the design and in the atlas, but are not generated yet.
- One file per category: `authorization.test.js`, `ui-vs-server-rules.test.js`.

### D2. Two kinds of test per class
- **`today:`** pins what the app does now, and should pass. "Success" accepts 200, 201 or 204. An expected error checks that the status is at least 400.
- **`spec:`** (`it.skip`) is added when the design expects something else than today: what the app *should* do, for example 403 instead of 200 on open personal data, or 4xx for an action in a state the UI hides. It is enabled once the finding is fixed.
- **Why both:** the `today` tests make the suite green and useful as a regression net from day one. The `spec` tests are the bug list in executable form.

### D3. How a test calls the app
- **Harness:** `cds.test(__dirname + '/../..', '--with-mocks')`. The files must sit two folders below the app root (`test/generated/`). `--with-mocks` serves required services that have no credentials as local mocks.
- **Requests:** `GET` or `POST` through cds.test's axios. The status is read from the response or from the error.
- **Who calls:** the class's representative user for authorization tests. Otherwise the first user the matrix allows for that entity and operation, else the first non-anonymous user.
- **Password:** taken from the mock user's config, otherwise empty.
- **Action body:** every parameter gets the value `10`. This is a placeholder that fits numeric parameters, such as SFlight's `deductDiscount(percent)`. Actions with string, date or structured parameters get a wrong body, and the test then checks only that an error comes back.
- **Checked:** each file goes through `node --check`, so a generated file always parses.

### D4. Manifest for the addons
- `manifest.json` maps each test title to its class id and kind (`today` / `spec`). The coverage, mutation and docs addons use it to tie test results back to classes.

### D5. Running in CI (`discover.yml`)
1. **Startup probe:** a one-test file that starts the app with `cds.test` and passes when at least one application service is served (piece 1 D13). If it fails, the generated tests are skipped and the atlas says so.
2. **Runner:** the app's own Jest and its config if it has one, otherwise Jest 29 with `testEnvironment: node`. If Jest cannot start the app, the same tests run with Node's own test runner (`node-test.js`), which writes a Jest-format report.
3. **Mocked auth:** `CDS_REQUIRES_AUTH_KIND=mocked` when piece 1 found token-only auth.
4. **Copy:** the generated files are copied to `<app>/test/generated/`. Nothing else in the app changes.
5. **Report:** the job summary, a PR comment and the run artifact. On pull requests a pilot that fails startup or the generated tests fails the check, unless that pilot has `gate: false`.

### D6. UI tests (addon `uitests`)
- OPA5 journeys (sap.fe.test) generated from the UI promises (piece 4), one per Fiori elements app, run headless in Chromium against the app started with `npx cds-serve` (in-memory SQLite, mocked auth), or against `--url`.
- UI5 is loaded from `ui5.sap.com` at the app's version, or from a mirror (`UI5_CDN_MIRROR`).
- The app is reached under `/<app id>` (cds-plugin-ui5) or under its folder below the app folder (CAP's static serving).

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| only classes with `req` are generated | gen-tests.js | categories 3 to 7 stay design only |
| test files live two levels below the app root | gen-tests.js header line | copying elsewhere breaks the `cds.test` path |
| `--with-mocks` | gen-tests.js | – |
| success statuses `[200, 201, 204]` | gen-tests.js `okStatus` | – |
| action parameter value per CDS type: numbers 10, strings `test`, booleans true, dates, UUID; enum: first value | gen-tests.js `valueFor` | – |
| empty password when none is configured | gen-tests.js | apps with real basic-auth passwords need them in the mock config |
| Jest 29 fallback, Node test runner fallback | discover.yml | – |
| startup pass = ≥ 1 ApplicationService served | discover.yml | – |
| test timeout 60 s, startup timeout 120 s | discover.yml | slow apps time out |

## Output
`run/tests/generated/*.test.js`, `manifest.json` and `README.md`. In CI also `out/jest-startup.json` and `out/jest-generated.json`, which the addons read in piece 11.
