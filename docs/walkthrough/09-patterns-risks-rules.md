---
piece: 9 of 12
title: Coding patterns, risk rules, rules drafted from agent findings
code: lib/analyse/patterns.js, lib/analyse/risks.js, addons/rules/ (engine.js, library/*.js)
runs: inside bin/atlas-facts.js (rules addon through its facts hook)
---

# Piece 9: Patterns, risks and rules

Goal: list the coding patterns the app uses (and where it deviates from them), and the risks with evidence, a score and the test that would catch each. Everything here is a fixed detector, so two runs on the same commit give the same list.

## 9a. Patterns (`patterns.js`)

- **What a pattern is:** name, where it is used, evidence, how often, health (`gd` good, `wn` works but sits in the wrong place, `cr` causes a defect or exposure), a note, and the layers it touches (ui, ann, srv, node, db, cfg).
- A pattern with 0 uses is not listed.
- **The detectors (46 `add` calls, some repeat per aspect or phase), by area:**
  - **Domain:** draft roots with compositions, auto-exposed master data (`cr` when it exposes personal data), aspects `cuid` / `managed` / `temporal`, code lists, localised texts, enums.
  - **Services:** projections on the domain, declarative authorization (`wn` when a service has no grant), `@readonly` entities, bound actions (`wn` when one has no handler), analytical annotations.
  - **UI annotations:** value helps, Fiori elements layout annotations, SideEffects, state rules in annotations (`wn` when only the UI keeps them), labels.
  - **CDS layering:** annotations outside their layer (`cr`), UI annotations directly on domain entities (`wn`).
  - **Node:**
    - class-based or function-style implementation
    - before / on / after handlers
    - handlers on draft tables
    - cds-typer types
    - shared helpers
    - raw SQL via `cds.run` (`wn`)
    - validation with `req.reject` / `req.error`
    - derived fields
  - **UI5, config, tests:** Fiori elements or freestyle apps, UI extensions, CSV seed data, cds.test service tests, OPA5 journeys.
  - **Integration:**
    - remote services
    - imported APIs
    - messaging
    - handlers on another service
    - event subscriptions
    - emitted events
    - calls to other services
    - implementations split over files
  - **HANA:** HDI artifacts, entities on native objects (`wn`: SQLite tests cannot read them), native SQL (`wn` when HANA-only), branches on the database kind (`wn`), database model per profile.
- **Text-based detectors** (the rest use the graph): class style (`extends cds.ApplicationService`), function style (`cds.service.impl` or `module.exports = function`), cds-typer (`#cds-models`). The CSV seed folders come from the layout (piece 8 D1).

## 9b. Risk rules (`risks.js`)

Each rule has a fixed impact (i) and likelihood (l) from 1 to 5, so scores can be compared between apps. Risks are sorted by i × l and numbered `G1`, `G2`, …

| Rule key | Fires when | i × l |
|---|---|---|
| `pii-open:<entity>` | a matrix row with personal data is open (`r`) | 4 × 4 if anonymous, else 4 × 3 |
| `ui-only:actions` | an OperationAvailable rule is `ui-only` | 3 × 4 |
| `ui-only:fields` | FieldControl, CreateHidden or DeleteHidden is `ui-only` | 3 × 3 |
| `partial:<rule>` | a UI rule is `partial` | 3 × 3 |
| `noimpl:<action>` | an action has no handler (actions of services served remotely are skipped) | 2 × 3 |
| `open-svc:<service>` | a service and all its entities have no grant | 3 × 3, or 3 × 1 with `restrict_all_services` |
| `row-level:<entity>` | a grant with a `where` clause | 4 × 2 |
| `global:<type>` | an annotate or extend on a built-in `cds.*` type | 2 × 3 |
| `layering` | other layer violations (piece 5f) | 2 × 2 |
| `ui5-errors` | UI5 lint errors | 2 × 2 |
| `tests-one-user` | grants exist but existing tests run as at most one user | 3 × 3 |
| `inherit:<entity>` | access inherited from a draft root (piece 7) | 2 × 2 |
| `hana-only` | entities backed by HDI objects, or code that uses procedures or sequences | 3 × 4 |
| `native-sql` | native SQL only HANA understands | 3 × 3 |
| `db-branch:<file>` | code that branches on the database kind | 3 × 4 |
| `db-variant` | database models differ between profiles | 2 × 3 |
| `remote-untested` | remote systems whose name or calling module no existing test mentions (`cds.xt.*` skipped) | 3 × 3 |
| `events-untested` | subscriptions to other services' events that no existing test mentions | 3 × 3 |

- **"Tested"** for remote systems and events means the text of the existing test files contains the name. It is a heuristic, like piece 5d.

## 9c. Rules drafted from agent findings (`addons/rules`)

- **What:** each file in `addons/rules/library/` is a detector that started as an agent finding (piece 12): `commented-out-grant`, `hard-coded-currency`, `max-plus-one-id`, `null-deref-in-guard`, `writable-owner-field`. Each has a unit test with a positive and a negative example.
- **Sources a rule sees:** `.cds`, `.js` and `.ts` files under the srv, db and app folders. It skips `node_modules`, `.git`, `gen`, `@cds-models`, `webapp`, `dist`, `test` and `src` folders, plus `.d.ts` and `.test.` files.
- **Status:** `draft` until a person sets it to `accepted`. Today **all five are drafts**. Drafts are listed in the RLS section next to the agent finding they reproduce. Only accepted rules add risks and retire the matching agent finding.
- **Hard-coded inside the rules** (by nature): the ISO currency list (20 codes) in `hard-coded-currency`, the `where ... = $user` shape in `writable-owner-field` (ownership is read from the grant, not from field names), and the shapes of `max(...) + 1` and of commented-out `@restrict`.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| pattern detectors with fixed health | patterns.js | new idioms are not listed until a detector exists |
| impact and likelihood per risk rule | risks.js | scores are opinions, fixed so they can be compared |
| tested = name appears in test text | risks.js `testText` | a test that mentions a name in a comment counts |
| `cds.xt.*` remotes skipped | risks.js | – |
| rules see srv, db, app; skip `gen @cds-models webapp dist test src` | addons/rules/engine.js | **rules never look at `<db>/src` (HDI) or tests** |
| rule status `draft` / `accepted` | each library file | drafts never change the risk list |

## Output
`D.PATTERNS` and `D.RISKS` in `atlas-data.json` (agent risks from the curated file join here; see piece 12), plus the RLS section and `pr/rules.md` from the rules addon.
