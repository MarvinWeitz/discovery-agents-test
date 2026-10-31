---
piece: 8 of 12
title: Test design (categories, equivalence classes, all-pairs)
code: lib/analyse/test-design.js, lib/analyse/seed-data.js
runs: inside bin/atlas-facts.js and bin/gen-tests.js
---

# Piece 8: Test design

Goal: turn the facts into equivalence classes, so that one test per class is enough. Each class has an expected outcome. Where the graph and the seed data allow it, a class also gets a concrete OData request that piece 10 turns into code.

## Decisions, in run order

### D1. Seed data for real keys (`seed-data.js`)
- **What:** every `.csv` under `<db>/data`, `<db>/csv` and `test/data`. The file name with `-` replaced by `.` is the entity name (`sap.fe.cap.travel-Travel.csv` → `sap.fe.cap.travel.Travel`). `.texts` files are skipped. The separator is `;` when the header has more `;` than `,`.
- **Why:** a request needs a key that exists. Picking a row with the right status from the seed data ("a Travel whose status is Open") gives a test that runs on the app's own data.
- **Gaps:**
  - The files come from CAP (`cds.deploy.resources` in the probe): `data/` and `csv/` next to **every** model file, `cds.requires.db.data`, and `test/data`, each with the entity CAP maps it to. Packages' data is left out.
  - Quoted fields with line breaks are not parsed.

### D2. Seven categories, each with its technique

| # | Category | Technique | Classes come from | Concrete request when |
|---|---|---|---|---|
| 1 | Authorization | role × operation | each matrix row (piece 7), grouped by outcome, one representative user per group | READ rows on entities that are not auto-exposed composition children: `GET <path>?$top=1` |
| 2 | UI vs server rules | reflexion | each UI promise (piece 4); for actions, each state the UI hides | a seed row exists with `<field>_code = <state>`: `POST <path>(<keys>)/<service>.<action>` |
| 3 | Status transitions | state machine | each action × each state in the domain | – |
| 4 | Handler rules | decision table | each rejection (guard true and false), derivation, conditional write | – |
| 5 | Framework constraints | boundary | `@mandatory` missing, `@readonly` written, `@assert.range` below min / min / max / above max | – |
| 6 | Draft lifecycle | state × user | each draft root: new → activate, edit → discard, edit while another user holds the draft | – |
| 7 | Combinations | all pairs | the action with the most rules (at least 2) | – |

### D3. Expected results
- **Authorization:** denied → 401 for anonymous, 403 otherwise. Allowed → 200. Open PII (`r`) → expected 401/403, while today's answer is 200, so a spec test is written as well (piece 10). Unclear (`a`) → "verify".
- **UI promise on an action in a hidden state:** expected a 4xx rejection. Today's result is "accepted" when the server allows that state (piece 4), otherwise "rejected".
- **Handler rejections:** the status from the code (400 when none), and the message.

### D4. Keys in the request
- **Which entity:** the seed rows of the projection source of the service entity.
- **Which row:** the first row whose columns match the condition. For a status, the column is assumed to be `<field>_code`, the foreign key of a code-list association.
- **Key format:** quoted, except for UUID-shaped values, which stay unquoted. Draft-enabled entities get `IsActiveEntity=true`.
- **Assumes:** the status is an association to a code list. A plain `String` status column (`status = 'O'`) gets no request.

### D5. Combinations (category 7)
- **Factors:**
  - each parameter of the top action: values `null`, below min, min, mid, max, above max when an `@assert.range` exists, otherwise `null` and `valid`
  - the status field with its whole domain
  - each field a guard compares with `null`: values `null`, `0`, `> 0`
  - target `active` or `draft`
  - `first` call or `again`
- **All pairs:** a greedy generator with a fixed seed (7) and 40 candidates per row, like Microsoft PICT. The same input always gives the same rows.
- **Expected per row:** a rule table. An invalid status → rejected. The first parameter invalid → 400. Other invalid values → 4xx precondition. A state the UI hides but the server allows → "accepted today".

### D6. Covered by an existing test?
- A class counts as covered when an existing test mentions the entity (piece 5d) and one of its test names contains a key word of the class (the action name, the message's first words, the field name). Words of 3 characters or fewer are ignored.
- Conditional writes look for the words `discount` or the entity name. **`discount` is a cap-sflight leftover** (its `deductDiscount` action).
- This is a heuristic. The coverage addon (piece 11) replaces it with real test results after CI ran.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| seed folders `<db>/data`, `<db>/csv`, `test/data` | layout.js `CONVENTIONS.seedData` | CSVs next to other model files are missed |
| CSV file name = entity name with `-` for `.` | seed-data.js | – |
| status column = `<field>_code` | test-design.js `keyOf` callers | plain string status columns get no request |
| key quoting by UUID shape | test-design.js `keyOf` | integer keys get quoted (CAP usually accepts this) |
| draft key suffix `IsActiveEntity=true` | test-design.js | – |
| expected statuses 401 / 403 / 200 / 400 | test-design.js | – |
| boundary values from `@assert.range` ± 1, mid = rounded mean | test-design.js | – |
| top action needs at least 2 rules for all-pairs | test-design.js | small apps get no category 7 |
| all-pairs seed 7, 40 tries | test-design.js `pairwise` | – |
| coverage word `discount` for conditional writes | test-design.js | **cap-sflight leftover** |
| name match ignores words of 3 characters or fewer | test-design.js `covered` | – |

## Output
`{ categories, auth, TR, DD }`: categories with classes (id, dimensions entity/op/state, fact, name, input, expected, today, request, covered_by), the transition table for the state machine, and the all-pairs design. It feeds the TST and STA atlas sections and the generated tests (piece 10).
