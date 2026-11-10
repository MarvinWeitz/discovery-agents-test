---
product: coverage
step: Coverage
status: warn
generated: 2026-11-10T15:00Z
---

# Coverage by class

_Coverage_ · Which business cases are tested (per equivalence class), and which handler rules a test executed in CI.



**16 of 122 classes tested (13%)**. Handler rules reached by any test: **9 of 11**.

![coverage by class](views/classes.svg)

### Test next

| Class | Category | Status | Score |
| --- | --- | --- | --- |
| /analytics: 8 other entities READ as anonymous | Authorization | none | 45 |
| /analytics: 8 other entities READ as rose/martha/amy/admin/alice | Authorization | none | 45 |
| /processor: 8 other entities READ as anonymous | Authorization | none | 45 |
| /processor: 8 other entities READ as rose/martha/amy/admin/alice | Authorization | none | 45 |
| Travel acceptTravel as anonymous/rose | Authorization | none | 45 |
| Travel acceptTravel as martha/amy/admin/alice | Authorization | likely | 45 |
| Travel create / edit / delete as anonymous/rose/martha | Authorization | none | 45 |
| Travel createTravelByTemplate as amy/admin/alice | Authorization | likely | 45 |
| Travel createTravelByTemplate as anonymous/rose/martha | Authorization | none | 45 |
| Travel deductDiscount as anonymous/rose | Authorization | none | 45 |
| Travel rejectTravel as anonymous/rose | Authorization | none | 45 |
| acceptTravel from A | Status transitions | none | 42 |
| … 3 more rows in the data file | | | |

### Rules no test reaches

| Rule | Kind | Guard | Where |
| --- | --- | --- | --- |
| rule:srv/travel-service.ts:29 | derivation | BookingSupplementID | srv/travel-service.ts:29 |
| rule:srv/travel-service.ts:107 | rejection | !succeeded && travel.BookingFee == null | srv/travel-service.ts:107 |


**Deeper:** [coverage.json](data/coverage.json)

Read from: `atlas-data.json COVERAGE`, `atlas-data.json MEASURED.rules (CI)` · [all products](../index.md)
