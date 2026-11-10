---
product: tests
step: Generated tests and test run
status: ok
generated: 2026-11-10T15:49Z
---

# Test results

_Generated tests and test run_ · The generated tests, and after a CI run their results (CTRF) and the requests they sent.



**12 passed**, 0 failed, 7 skipped of 19 tests. Report in CTRF: [results.ctrf.json](data/results.ctrf.json).

### Per test file

![Results per test file](views/files.svg)

| Test file | passed | failed | skipped (spec tests) |
| --- | --- | --- | --- |
| authorization.test.js | 8 | 0 | 4 |
| ui-vs-server-rules.test.js | 4 | 0 | 3 |

_2 test files_ · [browse with filters](browse.html#files) · [files.json](data/lists/files.json)

### Requests the tests sent

110 requests from 4 test files as 6 users.

| Entity | Event | Count | Users | Outcomes |
| --- | --- | --- | --- | --- |
| Travel | READ | 24 | admin, alice, amy, anonymous, martha, rose | 200×22 401×2 |
| Passenger | READ | 16 | admin, alice, amy, anonymous, martha, rose | 200×16 |
| TravelAgency | READ | 15 | admin, alice, amy, anonymous, martha, rose | 200×15 |
| Travel | deductDiscount | 12 | admin, alice, amy, anonymous, martha, rose | 200×5 400×5 401×1 403×1 |
| Travel | rejectTravel | 8 | admin, alice, amy, anonymous, martha, rose | 200×6 401×1 403×1 |
| Travel | acceptTravel | 7 | admin, alice, amy, anonymous, martha, rose | 200×5 401×1 403×1 |
| Travel | createTravelByTemplate | 6 | admin, alice, amy, anonymous, martha, rose | 401×1 403×2 501×3 |
| Travel | UPDATE | 5 | alice | 200×5 |
| Travel | NEW | 4 | admin, alice, amy | 200×4 |
| Travel | CREATE | 3 | anonymous, martha, rose | 401×1 403×2 |

**Top 10 of 15 entity × event pairs** by count. [Browse all 15 with filters](browse.html#requests) · [requests.json](data/lists/requests.json)

### All tests

| Test | Status | File | ms | Message |
| --- | --- | --- | --- | --- |
| Authorization (generated) spec: GET /analytics/TravelAgency as rose → 403 | skipped | authorization.test.js | 0 |  |
| Authorization (generated) spec: GET /analytics/Passenger as rose → 403 | skipped | authorization.test.js | 0 |  |
| Authorization (generated) spec: GET /processor/TravelAgency as rose → 403 | skipped | authorization.test.js | 0 |  |
| Authorization (generated) spec: GET /processor/Passenger as rose → 403 | skipped | authorization.test.js | 0 |  |
| UI vs server rules (generated) spec: rejectTravel on TravelStatus = X (UI hides it) as martha → 4xx rejection | skipped | ui-vs-server-rules.test.js | 0 |  |
| UI vs server rules (generated) spec: acceptTravel on TravelStatus = A (UI hides it) as martha → 4xx rejection | skipped | ui-vs-server-rules.test.js | 0 |  |
| UI vs server rules (generated) spec: deductDiscount on TravelStatus = X (UI hides it) as martha → 4xx rejection | skipped | ui-vs-server-rules.test.js | 0 |  |
| Authorization (generated) today: GET /analytics/TravelAgency as rose → 200 | passed | authorization.test.js | 44 |  |
| Authorization (generated) today: GET /analytics/Passenger as rose → 200 | passed | authorization.test.js | 8 |  |
| Authorization (generated) today: GET /processor/Travel as anonymous → 401 | passed | authorization.test.js | 9 |  |

**Top 10 of 19 tests** by failures first. [Browse all 19 with filters](browse.html#tests) · [tests.json](data/lists/tests.json)


**Deeper:** [browse.html](browse.html) · [results.ctrf.json](data/results.ctrf.json) · [generated.json](data/generated.json)

Read from: `run/tests/generated/manifest.json`, `jest-generated.json (CI)`, `atlas-data.json MEASURED.requests (CI)` · [all products](../index.md)
