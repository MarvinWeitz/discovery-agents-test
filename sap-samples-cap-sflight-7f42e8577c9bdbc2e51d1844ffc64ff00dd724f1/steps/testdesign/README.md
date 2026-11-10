---
product: testdesign
step: Test design
status: ok
generated: 2026-11-10T15:49Z
---

# Classification tree

_Test design_ · Equivalence classes per category (authorization, UI promises, status transitions, handler rules, …) and the pairwise rows that cover the combinations.



122 equivalence classes in 7 categories; 12 covered by a test today.

![classification tree](views/tree.svg)

| Category | Technique | Classes | Covered today | Why |
| --- | --- | --- | --- | --- |
| Authorization | role × operation | 25 | 6 | 13 operations × 6 users, grouped by outcome |
| UI vs server rules | reflexion | 22 | 3 | one class per UI promise; ui-only and partial ones are negative tests |
| Status transitions | state machine | 9 | 1 | each action from each state |
| Handler rules | decision table | 18 | 1 | each rejection: guard true and false; each derivation and conditional write: condition true and false |
| Framework constraints | boundary | 26 | 0 | @mandatory missing/present, @readonly ignored, @assert.range below/min/max/above |
| Draft lifecycle | state × user | 3 | 1 | new → activate, edit → discard, edit while another user holds the draft |
| deductDiscount combinations | combinatorial | 19 | 0 | all pairs over 5 factors (216 full) |

### Pairwise: deductDiscount

5 factors, 216 full combinations, **19 pairwise rows** cover every pair.

| percent | TravelStatus | BookingFee | target | repeat |
| --- | --- | --- | --- | --- |
| 1 | A | > 0 | active | first |
| 0 | X | null | draft | again |
| 101 | O | > 0 | draft | again |
| null | X | > 0 | active | again |
| 51 | A | 0 | draft | again |
| 100 | O | 0 | active | first |
| 100 | A | null | draft | again |
| 101 | X | null | active | first |
| 0 | A | 0 | draft | first |
| 1 | O | null | draft | again |
| null | O | null | draft | first |
| 51 | X | 0 | active | first |
| 0 | O | > 0 | active | first |
| 1 | X | 0 | active | first |
| 100 | X | > 0 | active | first |
| 101 | A | 0 | active | first |
| 51 | O | > 0 | active | first |
| null | A | 0 | active | first |
| 51 | X | null | active | first |

### All classes

| Category | Class | Input | Expected | Today |
| --- | --- | --- | --- | --- |
| Authorization | TravelAgency READ (PII: Street, PhoneNumber, EMailAddress) as anonymous/rose/martha/amy/admin/alice | user rose | 403 (today 200: open) |  |
| Authorization | Passenger READ (PII: FirstName, LastName, Street, …) as anonymous/rose/martha/amy/admin/alice | user rose | 403 (today 200: open) |  |
| Authorization | /analytics: 8 other entities READ as anonymous | user anonymous | verify |  |
| Authorization | /analytics: 8 other entities READ as rose/martha/amy/admin/alice | user rose | 200 |  |
| Authorization | Travel READ as anonymous | user anonymous | 401 |  |
| Authorization | Travel READ as rose/martha/amy/admin/alice | user rose | 200 |  |
| Authorization | Travel create / edit / delete as anonymous/rose/martha | user rose | 403 |  |
| Authorization | Travel create / edit / delete as amy/admin/alice | user amy | 200 |  |
| Authorization | Travel createTravelByTemplate as anonymous/rose/martha | user rose | 403 |  |
| Authorization | Travel createTravelByTemplate as amy/admin/alice | user amy | verify |  |

**Top 10 of 122 classes** by category (ascending). [Browse all 122 with filters](browse.html#classes) · [classes.json](data/lists/classes.json)


**Deeper:** [browse.html](browse.html) · [classes.json](data/classes.json) · [class-seeds.json](data/class-seeds.json)

Read from: `atlas-data.json TESTCATS, CLASSES, DD`, `run/tests/class-seeds.json` · [all products](../index.md)
