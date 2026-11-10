---
product: tests
step: Generated tests and test run
status: ok
generated: 2026-11-10T15:00Z
---

# Test results

_Generated tests and test run_ · The generated tests, and after a CI run their results (CTRF) and the requests they sent.



**12 passed**, 0 failed, 7 skipped of 19 tests. Report in CTRF: [results.ctrf.json](data/results.ctrf.json).

![results](views/results.svg)


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
| Booking | CREATE | 3 | anonymous, martha, rose | 401×1 403×2 |
| Booking | NEW | 3 | admin, alice, amy | 422×3 |
| Travel | EDIT | 2 | alice | 200×2 |
| Booking | UPDATE | 1 | alice | 200×1 |
| BookingSupplement | UPDATE | 1 | alice | 200×1 |

### All tests

| Test | Status | ms |
| --- | --- | --- |
| Authorization (generated) today: GET /analytics/TravelAgency as rose → 200 | passed | 32 |
| Authorization (generated) spec: GET /analytics/TravelAgency as rose → 403 | skipped | 0 |
| Authorization (generated) today: GET /analytics/Passenger as rose → 200 | passed | 7 |
| Authorization (generated) spec: GET /analytics/Passenger as rose → 403 | skipped | 0 |
| Authorization (generated) today: GET /processor/Travel as anonymous → 401 | passed | 10 |
| Authorization (generated) today: GET /processor/Travel as rose → 200 | passed | 8 |
| Authorization (generated) today: GET /processor/TravelAgency as rose → 200 | passed | 4 |
| Authorization (generated) spec: GET /processor/TravelAgency as rose → 403 | skipped | 0 |
| Authorization (generated) today: GET /processor/TravelAgency as amy → 200 | passed | 5 |
| Authorization (generated) today: GET /processor/Passenger as rose → 200 | passed | 4 |
| Authorization (generated) spec: GET /processor/Passenger as rose → 403 | skipped | 0 |
| Authorization (generated) today: GET /processor/Passenger as amy → 200 | passed | 6 |
| UI vs server rules (generated) today: rejectTravel on TravelStatus = X (UI hides it) as martha → success | passed | 58 |
| UI vs server rules (generated) spec: rejectTravel on TravelStatus = X (UI hides it) as martha → 4xx rejection | skipped | 0 |
| UI vs server rules (generated) today: acceptTravel on TravelStatus = A (UI hides it) as martha → success | passed | 10 |
| UI vs server rules (generated) spec: acceptTravel on TravelStatus = A (UI hides it) as martha → 4xx rejection | skipped | 0 |
| UI vs server rules (generated) today: deductDiscount on TravelStatus = X (UI hides it) as martha → success | passed | 13 |
| UI vs server rules (generated) spec: deductDiscount on TravelStatus = X (UI hides it) as martha → 4xx rejection | skipped | 0 |
| UI vs server rules (generated) today: deductDiscount on TravelStatus = A (UI hides it) as martha → error | passed | 22 |


**Deeper:** [results.ctrf.json](data/results.ctrf.json) · [generated.json](data/generated.json)

Read from: `run/tests/generated/manifest.json`, `jest-generated.json (CI)`, `atlas-data.json MEASURED.requests (CI)` · [all products](../index.md)
