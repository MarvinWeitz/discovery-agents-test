---
app: SAP-samples/cap-sflight
slice: S00
title: Cross-cutting
verified: 6
sentences: 10
results: CI test run
generator: cap-discovery-toolkit addons/docs
---

# Cross-cutting

6 of 10 statements are backed by a passing test. ✅ verified · ◐ an existing test exercises it, not asserted · ⬜ unverified · ❌ its test fails.

## For business

What the application does today, confirmed by tests.

### TravelAgency

- Anonymous callers, rose, martha, amy, admin and alice can, without any role, read TravelAgency. (tested as rose, rose) _(differs from the intended behaviour: should be denied (403))_ ✅ T-1, T-7
- Anonymous callers, rose and martha can, without any role, read TravelAgency. (tested as rose, rose) _(differs from the intended behaviour: should be denied (403))_ ✅ T-1, T-7
- Amy, admin and alice can read TravelAgency. (tested as amy) ✅ T-9

### Passenger

- Anonymous callers, rose, martha, amy, admin and alice can, without any role, read Passenger. (tested as rose, rose) _(differs from the intended behaviour: should be denied (403))_ ✅ T-3, T-10
- Anonymous callers, rose and martha can, without any role, read Passenger. (tested as rose, rose) _(differs from the intended behaviour: should be denied (403))_ ✅ T-3, T-10
- Amy, admin and alice can read Passenger. (tested as amy) ✅ T-12

<details><summary>4 statements not yet confirmed by a test</summary>

- ⬜ Anonymous callers may (not decidable from the model) read the other entities under /analytics.
- ⬜ Rose, martha, amy, admin and alice can read the other entities under /analytics.
- ⬜ Anonymous callers may (not decidable from the model) read the other entities under /processor.
- ⬜ Rose, martha, amy, admin and alice can read the other entities under /processor.

</details>

## For developers

How each statement is implemented, with evidence in the repository.

| | Statement | Mechanism | Evidence |
| --- | --- | --- | --- |
| ✅ | Anonymous callers, rose, martha, amy, admin and alice can, without any role, read TravelAgency. | TravelAgency READ (PII: Street, PhoneNumber, EMailAddress) as anonymous/rose/martha/amy/admin/alice: allowed although the data needs a role by @requires / @restrict. |  |
| ✅ | Anonymous callers, rose, martha, amy, admin and alice can, without any role, read Passenger. | Passenger READ (PII: FirstName, LastName, Street, …) as anonymous/rose/martha/amy/admin/alice: allowed although the data needs a role by @requires / @restrict. |  |
| ⬜ | Anonymous callers may (not decidable from the model) read the other entities under /analytics. | /analytics: 8 other entities READ as anonymous: unclear from annotations by @requires / @restrict. |  |
| ⬜ | Rose, martha, amy, admin and alice can read the other entities under /analytics. | /analytics: 8 other entities READ as rose/martha/amy/admin/alice: allowed by @requires / @restrict. |  |
| ✅ | Anonymous callers, rose and martha can, without any role, read TravelAgency. | TravelAgency READ (PII: Street, PhoneNumber, EMailAddress) as anonymous/rose/martha: allowed although the data needs a role by @requires / @restrict. |  |
| ✅ | Amy, admin and alice can read TravelAgency. | TravelAgency READ (PII: Street, PhoneNumber, EMailAddress) as amy/admin/alice: allowed by @requires / @restrict. |  |
| ✅ | Anonymous callers, rose and martha can, without any role, read Passenger. | Passenger READ (PII: FirstName, LastName, Street, …) as anonymous/rose/martha: allowed although the data needs a role by @requires / @restrict. |  |
| ✅ | Amy, admin and alice can read Passenger. | Passenger READ (PII: FirstName, LastName, Street, …) as amy/admin/alice: allowed by @requires / @restrict. |  |
| ⬜ | Anonymous callers may (not decidable from the model) read the other entities under /processor. | /processor: 8 other entities READ as anonymous: unclear from annotations by @requires / @restrict. |  |
| ⬜ | Rose, martha, amy, admin and alice can read the other entities under /processor. | /processor: 8 other entities READ as rose/martha/amy/admin/alice: allowed by @requires / @restrict. |  |

## For testers

Which test backs which statement, and what is missing.

| | Class | Test | Status | Intended behaviour |
| --- | --- | --- | --- | --- |
| ✅ | `AUT:TravelAgency READ (PII: Street, PhoneNumber, EMailAddress):r` | T-1 today: GET /analytics/TravelAgency as rose → 200; T-7 today: GET /processor/TravelAgency as rose → 200 | passed, passed | should be denied (403) (spec T-2, it.skip) |
| ✅ | `AUT:Passenger READ (PII: FirstName, LastName, Street, …):r` | T-3 today: GET /analytics/Passenger as rose → 200; T-10 today: GET /processor/Passenger as rose → 200 | passed, passed | should be denied (403) (spec T-4, it.skip) |
| ⬜ | `AUT:/analytics: 8 other entities READ:a` | none | – |  |
| ⬜ | `AUT:/analytics: 8 other entities READ:y` | none | – |  |
| ✅ | `AUT:TravelAgency READ (PII: Street, PhoneNumber, EMailAddress):r` | T-1 today: GET /analytics/TravelAgency as rose → 200; T-7 today: GET /processor/TravelAgency as rose → 200 | passed, passed | should be denied (403) (spec T-2, it.skip) |
| ✅ | `AUT:TravelAgency READ (PII: Street, PhoneNumber, EMailAddress):y` | T-9 today: GET /processor/TravelAgency as amy → 200 | passed |  |
| ✅ | `AUT:Passenger READ (PII: FirstName, LastName, Street, …):r` | T-3 today: GET /analytics/Passenger as rose → 200; T-10 today: GET /processor/Passenger as rose → 200 | passed, passed | should be denied (403) (spec T-4, it.skip) |
| ✅ | `AUT:Passenger READ (PII: FirstName, LastName, Street, …):y` | T-12 today: GET /processor/Passenger as amy → 200 | passed |  |
| ⬜ | `AUT:/processor: 8 other entities READ:a` | none | – |  |
| ⬜ | `AUT:/processor: 8 other entities READ:y` | none | – |  |
