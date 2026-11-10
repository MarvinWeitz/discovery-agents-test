---
product: errors
step: Handler AST and model validations
status: warn
generated: 2026-11-10T19:37Z
---

# Error messages

_Handler AST and model validations_ · Every message a user can get when the app says no: from handler code and from model validations, with status, field, condition, screens, translation and test status.



18 messages: 6 from handler code, 12 from model validations. **6 of the code messages are inline text** (one language only); **1 were never triggered by a test**.

### What does a user read when the app says no?

_Error messages are the part of the app users meet when things go wrong; an untranslated, vague or untested message is a support ticket waiting to happen, and the list doubles as the catalogue of business rules in words._ **Next:** Move inline texts into the i18n bundle, write a test that triggers each untested message, and check that each one tells the user what to do.

| Message | Status | Entity | Field | When | From | Translation | Tested | Screens | Where |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| No discount possible, as travel "${travel.ID}" does not yet have a booking fee added. | 404 | Travel |  | !succeeded && travel.BookingFee == null | code | inline text | never triggered | TravelList, TravelObjectPage | srv/travel-service.ts:107 |
| Begin Date must not be before today. | 400 | Travel | BeginDate | BeginDate < today() | code | inline text | triggered by a test | TravelList, TravelObjectPage | srv/travel-service.ts:36 |
| End Date must be after Begin Date. | 400 | Travel | EndDate | BeginDate > EndDate | code | inline text | triggered by a test | TravelList, TravelObjectPage | srv/travel-service.ts:37 |
| The travel is locked by ${existingDraft.InProcessByUser}. | 423 | Travel |  | !isDraft && existingDraft \|\| isDraft && existingDraft?.InProcessByUser !== req.user.id | code | inline text | triggered by a test | TravelList, TravelObjectPage | srv/travel-service.ts:93 |
| Travel "${travel.ID}" does not exist; may have been deleted meanwhile. | 404 | Travel |  | !succeeded && !travel | code | inline text | triggered by a test | TravelList, TravelObjectPage | srv/travel-service.ts:105 |
| Travel "${travel.ID}" has been approved already. | 400 | Travel |  | !succeeded && travel.status === TravelStatusCode.Accepted | code | inline text | triggered by a test | TravelList, TravelObjectPage | srv/travel-service.ts:106 |
| Provide the missing value. | 400 | Travel | BeginDate | value missing | model | CAP standard ASSERT_MANDATORY · 35 languages | not measured | TravelList, TravelObjectPage | db/schema.cds:15 |
| Provide the missing value. | 400 | Travel | EndDate | value missing | model | CAP standard ASSERT_MANDATORY · 35 languages | not measured | TravelList, TravelObjectPage | db/schema.cds:16 |
| Provide the missing value. | 400 | Travel | to_Agency | value missing | model | CAP standard ASSERT_MANDATORY · 35 languages | not measured | TravelList, TravelObjectPage | db/schema.cds:22 |
| Provide the missing value. | 400 | Travel | to_Customer | value missing | model | CAP standard ASSERT_MANDATORY · 35 languages | not measured | TravelList, TravelObjectPage | db/schema.cds:23 |

**Top 10 of 18 messages** by attention. [Browse all 18 with filters](browse.html#messages) · [messages.json](data/lists/messages.json)


**Deeper:** [browse.html](browse.html) · [messages.json](data/messages.json)

Read from: `run/graph/ (Rule, Handler, Route)`, `run/csn.json`, `@sap/cds _i18n/messages`, `app _i18n bundles`, `atlas-data.json MEASURED.rules (CI)` · [all products](../index.md)
