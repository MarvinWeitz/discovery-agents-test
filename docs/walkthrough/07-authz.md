---
piece: 7 of 12
title: Authorization matrix
code: lib/analyse/authz.js
runs: inside bin/atlas-facts.js and bin/gen-tests.js (computed from the graph, not stored)
---

# Piece 7: Authorization matrix

Goal: a table of user × operation, so that every cell can become a test (allowed → 200, denied → 401/403), and so that operations open to anyone, or showing personal data without a role, stand out.

## Decisions, in run order

### D1. Which users are columns
- **First column:** `anonymous`, with no roles.
- **Then:** every mock user from piece 5c. CAP's built-in users are cut down to one per distinct set of the app's roles, plus every built-in user an existing test runs as. Users the app defines itself are always kept.
- **Why:** CAP adds alice, bob and others in every app. Without the cut, the matrix would repeat identical columns.

### D2. Which operations are rows
For each service, each exposed entity (not generated, not `.texts`):
- **Entity with its own grants:** one READ row. Then either one "create / edit / delete" row (when CREATE, UPDATE and DELETE give the same result for every user) or three separate rows. Then one row per bound action.
- **Composition child without grants whose root has grants:** one row, "via the draft root". It is noted "inherits from the draft root? verify", because draft children go through the root at runtime, but direct requests to the child set may behave differently.
- **Entity without grants that has personal data:** one READ row per entity, marked PII.
- **All other entities without grants:** one summary READ row per service ("N other entities").

### D3. Cell values
- **A grant matches a user** when its role is `any`, or `authenticated-user` for a logged-in user, or one of the user's roles; **and** its grant list has `*`, the operation, or `WRITE` for a non-READ operation.
- **The service must let the user in first:** the service has no grants, or the user matches a `*` or READ grant on the service.
- **Values:**
  - `y`: allowed
  - `n`: denied
  - `a`: allowed only through grants with a `where` clause (own rows only), or granted but the action has no handler. Verify with a request.
  - `r`: open. Personal data readable without a role that the app otherwise uses.
- **Open entities without grants:** anonymous gets `n` when `restrict_all_services` is on, otherwise `a`. The value comes from the app's config and CAP's defaults (piece 5c), so the matrix follows the app.
- **Tested cell:** an existing test that mentions the entity and runs as that user marks the cell as tested. This is approximate, because "mentions" is a text match (piece 5d).

### D5. Measured in CI (addon `measured`)
- **What:** `addons/measured/authz-probe.test.js` runs in the app's test runtime (`cds.test`, mocked users) and sends one request per matrix row as every user: GET, POST, PATCH, DELETE or the bound action, with keys from the seed data (`plan.json`, written by the pipeline).
- **Verdict:** CAP's own auth handlers decide. 401/403 = `n`, 405 = `n405` (Capabilities), anything else (2xx, 400 validation, 404, 409 from a handler) = got past authorization = `y`.
- **Compare:** each cell is `agree`, `differ` or `measured` (the static value was `a`). The MSR section and `pr/measured.md` show the differences; a KPI counts them.
- **Why:** the static matrix models CAP's rules; the probe asks CAP. A difference is either a toolkit bug or a rule the model misses.

### D4. Personal data
- An element name counts as personal data when it matches: `firstname`, `lastname`, `middlename`, `givenname`, `familyname`, `e-mail`/`email`, `phone`, `street`, `birth`, `iban`, `creditcard`, `ssn`, `passport`, `taxid` (case-insensitive).
- **Assumes English field names.** German or abbreviated names (`Vorname`, `Strasse`, `tel`, `dob`) are not detected.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| personal data = `@PersonalData` fields + English name pattern | authz.js `piiFields`, `PII` | unannotated fields with non-English names are missed |
| pseudo roles `any`, `authenticated-user` | authz.js `hits` | `system-user` and `internal-user` are not treated specially |
| `WRITE` covers CREATE, UPDATE, DELETE | authz.js | – |
| one column per distinct role set of CAP's built-in users | authz.js `users` | – |
| expected status: anonymous 401, user without role 403 | used in piece 8 | an approuter in front may answer 302 or 401 for everything |

## Output
`{ users, rows }`: each row has the operation label, service, entity, operation token, evidence, an optional note, and one cell per user (`v` value, `t` tested). It feeds the AUT section of the atlas, the authorization test category (piece 8) and four risk rules (piece 9).
