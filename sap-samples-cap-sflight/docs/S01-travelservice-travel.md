---
app: SAP-samples/cap-sflight
slice: S01
title: TravelService / Travel
verified: 6
sentences: 79
results: CI test run
generator: cap-discovery-toolkit addons/docs
---

# TravelService / Travel

6 of 79 statements are backed by a passing test. ✅ verified · ◐ an existing test exercises it, not asserted · ⬜ unverified · ❌ its test fails.

## For business

What the application does today, confirmed by tests.

### Travel

- Anonymous callers cannot read Travel. (tested as anonymous) ✅ T-5
- Rose, martha, amy, admin and alice can read Travel. (tested as rose) ✅ T-6
- The app hides "rejectTravel" for a Travel in status X; the server still accepts it when called directly. _(differs from the intended behaviour: server should reject it (4xx))_ ✅ T-13
- The app hides "acceptTravel" for a Travel in status A; the server still accepts it when called directly. _(differs from the intended behaviour: server should reject it (4xx))_ ✅ T-15
- The app hides "deductDiscount" for a Travel in status X; the server still accepts it when called directly. _(differs from the intended behaviour: server should reject it (4xx))_ ✅ T-17
- The app hides "deductDiscount" for a Travel in status A; the server also rejects it. ✅ T-19

<details><summary>73 statements not yet confirmed by a test</summary>

- ⬜ Anonymous callers, rose and martha cannot create, edit and delete Travel.
- ◐ Amy, admin and alice can create, edit and delete Travel.
- ⬜ Anonymous callers, rose and martha cannot call createTravelByTemplate on Travel.
- ⬜ Amy, admin and alice may (not decidable from the model) call createTravelByTemplate on Travel.
- ⬜ Anonymous callers and rose cannot call rejectTravel on Travel.
- ◐ Martha, amy, admin and alice can call rejectTravel on Travel.
- ⬜ Anonymous callers and rose cannot call acceptTravel on Travel.
- ⬜ Martha, amy, admin and alice can call acceptTravel on Travel.
- ⬜ Anonymous callers and rose cannot call deductDiscount on Travel.
- ◐ Martha, amy, admin and alice can call deductDiscount on Travel.
- ⬜ Anonymous callers cannot create, edit and delete Booking.
- ⬜ Rose and martha may (not decidable from the model) create, edit and delete Booking.
- ◐ Amy, admin and alice can create, edit and delete Booking.
- ⬜ Travel: 5 fields controlled by TravelStatus.fieldControl — bypass via OData: 4xx rejection.
- ⬜ Travel: BookingFee → re-read TotalPrice, GreenFee, TreesPlanted: targets recomputed.
- ⬜ Travel: GoGreen → re-read TotalPrice, GreenFee, TreesPlanted: targets recomputed.
- ⬜ Travel: to_Booking → re-read TotalPrice: targets recomputed.
- ⬜ Travel: percent in [1, 100]: CAP rejects / ignores.
- ⬜ Travel: TravelID, TotalPrice, TravelStatus, GreenFee, TreesPlanted: CAP rejects / ignores.
- ⬜ Travel: BeginDate, EndDate, to_Agency, to_Customer: CAP rejects / ignores.
- ⬜ Booking: 6 fields controlled by to_Travel.TravelStatus.fieldControl — bypass via OData: 4xx rejection.
- ⬜ Booking: hidden when to_Travel.TravelStatus.code != #Open — bypass via OData: 4xx rejection.
- ⬜ Booking: hidden when to_Travel.TravelStatus.code != #Open — bypass via OData: 4xx rejection.
- ⬜ Booking: ConnectionID, FlightDate, FlightPrice, BookingStatus, to_Carrier, to_Customer: CAP rejects / ignores.
- ⬜ BookingSupplement: 4 fields controlled by to_Travel.TravelStatus.fieldControl — bypass via OData: 4xx rejection.
- ⬜ BookingSupplement: Price, to_Supplement: CAP rejects / ignores.
- ◐ "rejectTravel" on a Travel in status X: moves it to X.
- ◐ "rejectTravel" on a Travel in status A: moves it to X.
- ◐ "rejectTravel" on a Travel in status O: moves it to X.
- ⬜ "acceptTravel" on a Travel in status X: moves it to A.
- ⬜ "acceptTravel" on a Travel in status A: moves it to A.
- ⬜ "acceptTravel" on a Travel in status O: moves it to A.
- ◐ "deductDiscount" on a Travel in status X: moves it to X.
- ◐ "deductDiscount" on a Travel in status A: refused.
- ◐ "deductDiscount" on a Travel in status O: moves it to O.
- ◐ The server fills Travel.TravelID itself.
- ⬜ The server fills Booking.BookingID itself.
- ⬜ The server fills Booking.BookingDate itself.
- ⬜ The server fills BookingSupplement.BookingSupplementID itself.
- ◐ Save on Travel is refused when BeginDate < today(): "Begin Date must not be before today.".
- ◐ Save on Travel goes through when "Begin Date must not be before today." does not apply.
- ◐ Save on Travel is refused when BeginDate > EndDate: "End Date must be after Begin Date.".
- ◐ Save on Travel goes through when "End Date must be after Begin Date." does not apply.
- ⬜ Accepttravel/rejecttravel on Travel is refused when !isDraft && existingDraft || isDraft && existingDraft?.InProcessByUser !is req.user.id: "The travel is locked by ….".
- ⬜ Accepttravel/rejecttravel on Travel goes through when "The travel is locked by ${existingDraft.InProcessByUser}." does not apply.
- ◐ on deductDiscount Travel: write when TravelStatus.code != 'A' and BookingFee != null.
- ◐ on deductDiscount Travel: no write.
- ◐ Deductdiscount on Travel is refused when !travel: "Travel "…" does not exist; may have been deleted meanwhile.".
- ◐ Deductdiscount on Travel goes through when "Travel "${travel.ID}" does not exist; may have been deleted meanwhile." does not apply.
- ◐ Deductdiscount on Travel is refused when status is Accepted: "Travel "…" has been approved already.".
- ◐ Deductdiscount on Travel goes through when "Travel "${travel.ID}" has been approved already." does not apply.
- ◐ Deductdiscount on Travel is refused when BookingFee is null: "No discount possible, as travel "…" does not yet have a booking fee added.".
- ◐ Deductdiscount on Travel goes through when "No discount possible, as travel "${travel.ID}" does not yet have a booking fee added." does not apply.
- ◐ deductDiscount: percent below min: 400 out of range.
- ◐ deductDiscount: percent min: accepted.
- ◐ deductDiscount: percent max: accepted.
- ◐ deductDiscount: percent above max: 400 out of range.
- ⬜ Travel: write TravelID, TotalPrice, TravelStatus, GreenFee, TreesPlanted: values ignored.
- ⬜ Travel: save without BeginDate: 400 on activate.
- ⬜ Travel: save without EndDate: 400 on activate.
- ⬜ Travel: save without to_Agency: 400 on activate.
- ⬜ Travel: save without to_Customer: 400 on activate.
- ⬜ Booking: save without ConnectionID: 400 on activate.
- ⬜ Booking: save without FlightDate: 400 on activate.
- ⬜ Booking: save without FlightPrice: 400 on activate.
- ⬜ Booking: save without BookingStatus: 400 on activate.
- ⬜ Booking: save without to_Carrier: 400 on activate.
- ⬜ Booking: save without to_Customer: 400 on activate.
- ⬜ BookingSupplement: save without Price: 400 on activate.
- ⬜ BookingSupplement: save without to_Supplement: 400 on activate.
- ⬜ Travel: new → activate: active row created.
- ⬜ Travel: edit → discard: active row unchanged.
- ⬜ Travel: foreign → lock: 423 / locked.

</details>

## For developers

How each statement is implemented, with evidence in the repository.

| | Statement | Mechanism | Evidence |
| --- | --- | --- | --- |
| ✅ | Anonymous callers cannot read Travel. | Travel READ as anonymous: denied (401/403) by @requires / @restrict. |  |
| ✅ | Rose, martha, amy, admin and alice can read Travel. | Travel READ as rose/martha/amy/admin/alice: allowed by @requires / @restrict. |  |
| ⬜ | Anonymous callers, rose and martha cannot create, edit and delete Travel. | Travel create / edit / delete as anonymous/rose/martha: denied (401/403) by @requires / @restrict. |  |
| ◐ | Amy, admin and alice can create, edit and delete Travel. | Travel create / edit / delete as amy/admin/alice: allowed by @requires / @restrict. |  |
| ⬜ | Anonymous callers, rose and martha cannot call createTravelByTemplate on Travel. | Travel createTravelByTemplate as anonymous/rose/martha: denied (401/403) by @requires / @restrict. |  |
| ⬜ | Amy, admin and alice may (not decidable from the model) call createTravelByTemplate on Travel. | Travel createTravelByTemplate as amy/admin/alice: unclear from annotations by @requires / @restrict. |  |
| ⬜ | Anonymous callers and rose cannot call rejectTravel on Travel. | Travel rejectTravel as anonymous/rose: denied (401/403) by @requires / @restrict. |  |
| ◐ | Martha, amy, admin and alice can call rejectTravel on Travel. | Travel rejectTravel as martha/amy/admin/alice: allowed by @requires / @restrict. |  |
| ⬜ | Anonymous callers and rose cannot call acceptTravel on Travel. | Travel acceptTravel as anonymous/rose: denied (401/403) by @requires / @restrict. |  |
| ⬜ | Martha, amy, admin and alice can call acceptTravel on Travel. | Travel acceptTravel as martha/amy/admin/alice: allowed by @requires / @restrict. |  |
| ⬜ | Anonymous callers and rose cannot call deductDiscount on Travel. | Travel deductDiscount as anonymous/rose: denied (401/403) by @requires / @restrict. |  |
| ◐ | Martha, amy, admin and alice can call deductDiscount on Travel. | Travel deductDiscount as martha/amy/admin/alice: allowed by @requires / @restrict. |  |
| ⬜ | Anonymous callers cannot create, edit and delete Booking. | Booking / BookingSupplement (via Travel draft) as anonymous: denied (401/403) by @requires / @restrict. |  |
| ⬜ | Rose and martha may (not decidable from the model) create, edit and delete Booking. | Booking / BookingSupplement (via Travel draft) as rose/martha: unclear from annotations by @requires / @restrict. |  |
| ◐ | Amy, admin and alice can create, edit and delete Booking. | Booking / BookingSupplement (via Travel draft) as amy/admin/alice: allowed by @requires / @restrict. |  |
| ✅ | The app hides "rejectTravel" for a Travel in status X; the server still accepts it when called directly. | @Core.OperationAvailable hides rejectTravel for X; no handler checks the status. | `app/travel_processor/field-control.cds:37` |
| ✅ | The app hides "acceptTravel" for a Travel in status A; the server still accepts it when called directly. | @Core.OperationAvailable hides acceptTravel for A; no handler checks the status. | `app/travel_processor/field-control.cds:41` |
| ✅ | The app hides "deductDiscount" for a Travel in status X; the server still accepts it when called directly. | @Core.OperationAvailable hides deductDiscount for X; no handler checks the status. | `app/travel_processor/field-control.cds:45` |
| ✅ | The app hides "deductDiscount" for a Travel in status A; the server also rejects it. | @Core.OperationAvailable hides deductDiscount for A; a handler rejects it. | `app/travel_processor/field-control.cds:45` |
| ⬜ | Travel: 5 fields controlled by TravelStatus.fieldControl — bypass via OData: 4xx rejection. | Travel: 5 fields controlled by TravelStatus.fieldControl — bypass via OData: 4xx rejection (input: PATCH/POST on a non-open instance). | `app/travel_processor/field-control.cds:29` |
| ⬜ | Travel: BookingFee → re-read TotalPrice, GreenFee, TreesPlanted: targets recomputed. | Travel: BookingFee → re-read TotalPrice, GreenFee, TreesPlanted: targets recomputed (input: side-effects). | `app/travel_processor/field-control.cds:20` |
| ⬜ | Travel: GoGreen → re-read TotalPrice, GreenFee, TreesPlanted: targets recomputed. | Travel: GoGreen → re-read TotalPrice, GreenFee, TreesPlanted: targets recomputed (input: side-effects). | `app/travel_processor/field-control.cds:20` |
| ⬜ | Travel: to_Booking → re-read TotalPrice: targets recomputed. | Travel: to_Booking → re-read TotalPrice: targets recomputed (input: side-effects). | `app/travel_processor/field-control.cds:51` |
| ⬜ | Travel: percent in [1, 100]: CAP rejects / ignores. | Travel: percent in [1, 100]: CAP rejects / ignores (input: assert.range). | `srv/travel-service.cds:20` |
| ⬜ | Travel: TravelID, TotalPrice, TravelStatus, GreenFee, TreesPlanted: CAP rejects / ignores. | Travel: TravelID, TotalPrice, TravelStatus, GreenFee, TreesPlanted: CAP rejects / ignores (input: readonly). | `db/schema.cds:14` |
| ⬜ | Travel: BeginDate, EndDate, to_Agency, to_Customer: CAP rejects / ignores. | Travel: BeginDate, EndDate, to_Agency, to_Customer: CAP rejects / ignores (input: mandatory). | `db/schema.cds:15` |
| ⬜ | Booking: 6 fields controlled by to_Travel.TravelStatus.fieldControl — bypass via OData: 4xx rejection. | Booking: 6 fields controlled by to_Travel.TravelStatus.fieldControl — bypass via OData: 4xx rejection (input: PATCH/POST on a non-open instance). | `app/travel_processor/field-control.cds:65` |
| ⬜ | Booking: hidden when to_Travel.TravelStatus.code != #Open — bypass via OData: 4xx rejection. | Booking: hidden when to_Travel.TravelStatus.code != #Open — bypass via OData: 4xx rejection (input: PATCH/POST on a non-open instance). | `app/travel_processor/field-control.cds:60` |
| ⬜ | Booking: hidden when to_Travel.TravelStatus.code != #Open — bypass via OData: 4xx rejection. | Booking: hidden when to_Travel.TravelStatus.code != #Open — bypass via OData: 4xx rejection (input: PATCH/POST on a non-open instance). | `app/travel_processor/field-control.cds:61` |
| ⬜ | Booking: ConnectionID, FlightDate, FlightPrice, BookingStatus, to_Carrier, to_Customer: CAP rejects / ignores. | Booking: ConnectionID, FlightDate, FlightPrice, BookingStatus, to_Carrier, to_Customer: CAP rejects / ignores (input: mandatory). | `db/schema.cds:37` |
| ⬜ | BookingSupplement: 4 fields controlled by to_Travel.TravelStatus.fieldControl — bypass via OData: 4xx rejection. | BookingSupplement: 4 fields controlled by to_Travel.TravelStatus.fieldControl — bypass via OData: 4xx rejection (input: PATCH/POST on a non-open instance). | `app/travel_processor/field-control.cds:29` |
| ⬜ | BookingSupplement: Price, to_Supplement: CAP rejects / ignores. | BookingSupplement: Price, to_Supplement: CAP rejects / ignores (input: mandatory). | `db/schema.cds:22` |
| ◐ | "rejectTravel" on a Travel in status X: moves it to X. | State machine: rejectTravel from X → X; UI expects rejected. | `app/travel_processor/field-control.cds:37` |
| ◐ | "rejectTravel" on a Travel in status A: moves it to X. | State machine: rejectTravel from A → X; UI expects → X. | `app/travel_processor/field-control.cds:37` |
| ◐ | "rejectTravel" on a Travel in status O: moves it to X. | State machine: rejectTravel from O → X; UI expects → X. | `app/travel_processor/field-control.cds:37` |
| ⬜ | "acceptTravel" on a Travel in status X: moves it to A. | State machine: acceptTravel from X → A; UI expects → A. | `app/travel_processor/field-control.cds:41` |
| ⬜ | "acceptTravel" on a Travel in status A: moves it to A. | State machine: acceptTravel from A → A; UI expects rejected. | `app/travel_processor/field-control.cds:41` |
| ⬜ | "acceptTravel" on a Travel in status O: moves it to A. | State machine: acceptTravel from O → A; UI expects → A. | `app/travel_processor/field-control.cds:41` |
| ◐ | "deductDiscount" on a Travel in status X: moves it to X. | State machine: deductDiscount from X → X; UI expects rejected. | `app/travel_processor/field-control.cds:45` |
| ◐ | "deductDiscount" on a Travel in status A: refused. | State machine: deductDiscount from A rejected; UI expects rejected. | `app/travel_processor/field-control.cds:45` |
| ◐ | "deductDiscount" on a Travel in status O: moves it to O. | State machine: deductDiscount from O → O; UI expects → O. | `app/travel_processor/field-control.cds:45` |
| ◐ | The server fills Travel.TravelID itself. | TravelID = `++maxID`. | `srv/travel-service.ts:18` |
| ⬜ | The server fills Booking.BookingID itself. | BookingID = `++maxID`. | `srv/travel-service.ts:23` |
| ⬜ | The server fills Booking.BookingDate itself. | BookingDate = `today()`. | `srv/travel-service.ts:24` |
| ⬜ | The server fills BookingSupplement.BookingSupplementID itself. | BookingSupplementID = `++maxID`. | `srv/travel-service.ts:29` |
| ◐ | Save on Travel is refused when BeginDate < today(): "Begin Date must not be before today.". | before SAVE Travel: Begin Date must not be before today.: `if (BeginDate < today())` → reject 400. | `srv/travel-service.ts:36` |
| ◐ | Save on Travel goes through when "Begin Date must not be before today." does not apply. | before SAVE Travel: guard false: guard `BeginDate < today()` false → passes. | `srv/travel-service.ts:36` |
| ◐ | Save on Travel is refused when BeginDate > EndDate: "End Date must be after Begin Date.". | before SAVE Travel: End Date must be after Begin Date.: `if (BeginDate > EndDate)` → reject 400. | `srv/travel-service.ts:37` |
| ◐ | Save on Travel goes through when "End Date must be after Begin Date." does not apply. | before SAVE Travel: guard false: guard `BeginDate > EndDate` false → passes. | `srv/travel-service.ts:37` |
| ⬜ | Accepttravel/rejecttravel on Travel is refused when !isDraft && existingDraft \|\| isDraft && existingDraft?.InProcessByUser !is req.user.id: "The travel is locked by ….". | before acceptTravel/rejectTravel Travel: The travel is locked by ${existingDraft.InProcessByUser}.: `if (!isDraft && existingDraft \|\| isDraft && existingDraft?.InProcessByUser !== req.user.id)` → reject 423. | `srv/travel-service.ts:93` |
| ⬜ | Accepttravel/rejecttravel on Travel goes through when "The travel is locked by ${existingDraft.InProcessByUser}." does not apply. | before acceptTravel/rejectTravel Travel: guard false: guard `!isDraft && existingDraft \|\| isDraft && existingDraft?.InProcessByUser !== req.user.id` false → passes. | `srv/travel-service.ts:93` |
| ◐ | on deductDiscount Travel: write when TravelStatus.code != 'A' and BookingFee != null. | on deductDiscount Travel: write when TravelStatus.code != 'A' and BookingFee != null: row updated. | `srv/travel-service.ts:99` |
| ◐ | on deductDiscount Travel: no write. | on deductDiscount Travel: no write: nothing updated, error explains why. | `srv/travel-service.ts:99` |
| ◐ | Deductdiscount on Travel is refused when !travel: "Travel "…" does not exist; may have been deleted meanwhile.". | on deductDiscount Travel: Travel "${travel.ID}" does not exist; may have been deleted meanwhile.: `if (!succeeded && !travel)` → reject 404. | `srv/travel-service.ts:105` |
| ◐ | Deductdiscount on Travel goes through when "Travel "${travel.ID}" does not exist; may have been deleted meanwhile." does not apply. | on deductDiscount Travel: guard false: guard `!succeeded && !travel` false → passes. | `srv/travel-service.ts:105` |
| ◐ | Deductdiscount on Travel is refused when status is Accepted: "Travel "…" has been approved already.". | on deductDiscount Travel: Travel "${travel.ID}" has been approved already.: `if (!succeeded && travel.status === TravelStatusCode.Accepted)` → reject 400. | `srv/travel-service.ts:106` |
| ◐ | Deductdiscount on Travel goes through when "Travel "${travel.ID}" has been approved already." does not apply. | on deductDiscount Travel: guard false: guard `!succeeded && travel.status === TravelStatusCode.Accepted` false → passes. | `srv/travel-service.ts:106` |
| ◐ | Deductdiscount on Travel is refused when BookingFee is null: "No discount possible, as travel "…" does not yet have a booking fee added.". | on deductDiscount Travel: No discount possible, as travel "${travel.ID}" does not yet have a booking fee added.: `if (!succeeded && travel.BookingFee == null)` → reject 404. | `srv/travel-service.ts:107` |
| ◐ | Deductdiscount on Travel goes through when "No discount possible, as travel "${travel.ID}" does not yet have a booking fee added." does not apply. | on deductDiscount Travel: guard false: guard `!succeeded && travel.BookingFee == null` false → passes. | `srv/travel-service.ts:107` |
| ◐ | deductDiscount: percent below min: 400 out of range. | deductDiscount: percent below min: 400 out of range (input: below min). | `srv/travel-service.cds:20` |
| ◐ | deductDiscount: percent min: accepted. | deductDiscount: percent min: accepted (input: min). | `srv/travel-service.cds:20` |
| ◐ | deductDiscount: percent max: accepted. | deductDiscount: percent max: accepted (input: max). | `srv/travel-service.cds:20` |
| ◐ | deductDiscount: percent above max: 400 out of range. | deductDiscount: percent above max: 400 out of range (input: above max). | `srv/travel-service.cds:20` |
| ⬜ | Travel: write TravelID, TotalPrice, TravelStatus, GreenFee, TreesPlanted: values ignored. | Travel: write TravelID, TotalPrice, TravelStatus, GreenFee, TreesPlanted: values ignored (input: client sends read-only fields). | `db/schema.cds:14` |
| ⬜ | Travel: save without BeginDate: 400 on activate. | Travel: save without BeginDate: 400 on activate (input: BeginDate missing). | `db/schema.cds:15` |
| ⬜ | Travel: save without EndDate: 400 on activate. | Travel: save without EndDate: 400 on activate (input: EndDate missing). | `db/schema.cds:15` |
| ⬜ | Travel: save without to_Agency: 400 on activate. | Travel: save without to_Agency: 400 on activate (input: to_Agency missing). | `db/schema.cds:15` |
| ⬜ | Travel: save without to_Customer: 400 on activate. | Travel: save without to_Customer: 400 on activate (input: to_Customer missing). | `db/schema.cds:15` |
| ⬜ | Booking: save without ConnectionID: 400 on activate. | Booking: save without ConnectionID: 400 on activate (input: ConnectionID missing). | `db/schema.cds:37` |
| ⬜ | Booking: save without FlightDate: 400 on activate. | Booking: save without FlightDate: 400 on activate (input: FlightDate missing). | `db/schema.cds:37` |
| ⬜ | Booking: save without FlightPrice: 400 on activate. | Booking: save without FlightPrice: 400 on activate (input: FlightPrice missing). | `db/schema.cds:37` |
| ⬜ | Booking: save without BookingStatus: 400 on activate. | Booking: save without BookingStatus: 400 on activate (input: BookingStatus missing). | `db/schema.cds:37` |
| ⬜ | Booking: save without to_Carrier: 400 on activate. | Booking: save without to_Carrier: 400 on activate (input: to_Carrier missing). | `db/schema.cds:37` |
| ⬜ | Booking: save without to_Customer: 400 on activate. | Booking: save without to_Customer: 400 on activate (input: to_Customer missing). | `db/schema.cds:37` |
| ⬜ | BookingSupplement: save without Price: 400 on activate. | BookingSupplement: save without Price: 400 on activate (input: Price missing). | `db/schema.cds:22` |
| ⬜ | BookingSupplement: save without to_Supplement: 400 on activate. | BookingSupplement: save without to_Supplement: 400 on activate (input: to_Supplement missing). | `db/schema.cds:22` |
| ⬜ | Travel: new → activate: active row created. | Travel: new → activate: active row created (input: new-activate). | `srv/travel-service.cds:11` |
| ⬜ | Travel: edit → discard: active row unchanged. | Travel: edit → discard: active row unchanged (input: edit-discard). | `srv/travel-service.cds:11` |
| ⬜ | Travel: foreign → lock: 423 / locked. | Travel: foreign → lock: 423 / locked (input: foreign-lock). | `srv/travel-service.cds:11` |

## For testers

Which test backs which statement, and what is missing.

| | Class | Test | Status | Intended behaviour |
| --- | --- | --- | --- | --- |
| ✅ | `AUT:Travel READ:n` | T-5 today: GET /processor/Travel as anonymous → 401 | passed |  |
| ✅ | `AUT:Travel READ:y` | T-6 today: GET /processor/Travel as rose → 200 | passed |  |
| ⬜ | `AUT:Travel create / edit / delete:n` | none | – |  |
| ◐ | `AUT:Travel create / edit / delete:y` | existing: test/odata.test.ts:117, test/odata.test.ts:121, test/odata.test.ts:148 | – |  |
| ⬜ | `AUT:Travel createTravelByTemplate:n` | none | – |  |
| ⬜ | `AUT:Travel createTravelByTemplate:a` | none | – |  |
| ⬜ | `AUT:Travel rejectTravel:n` | none | – |  |
| ◐ | `AUT:Travel rejectTravel:y` | existing: test/odata.test.ts:147 | – |  |
| ⬜ | `AUT:Travel acceptTravel:n` | none | – |  |
| ⬜ | `AUT:Travel acceptTravel:y` | none | – |  |
| ⬜ | `AUT:Travel deductDiscount:n` | none | – |  |
| ◐ | `AUT:Travel deductDiscount:y` | existing: test/odata.test.ts:214 | – |  |
| ⬜ | `AUT:Booking / BookingSupplement (via Travel draft):n` | none | – |  |
| ⬜ | `AUT:Booking / BookingSupplement (via Travel draft):a` | none | – |  |
| ◐ | `AUT:Booking / BookingSupplement (via Travel draft):y` | existing: test/odata.test.ts:155 | – |  |
| ✅ | `UIS:rejectTravel:X` | T-13 today: rejectTravel on TravelStatus = X (UI hides it) as martha → success | passed | server should reject it (4xx) (spec T-14, it.skip) |
| ✅ | `UIS:acceptTravel:A` | T-15 today: acceptTravel on TravelStatus = A (UI hides it) as martha → success | passed | server should reject it (4xx) (spec T-16, it.skip) |
| ✅ | `UIS:deductDiscount:X` | T-17 today: deductDiscount on TravelStatus = X (UI hides it) as martha → success | passed | server should reject it (4xx) (spec T-18, it.skip) |
| ✅ | `UIS:deductDiscount:A` | T-19 today: deductDiscount on TravelStatus = A (UI hides it) as martha → error | passed |  |
| ⬜ | `UIS:field-control:Travel` | none | – |  |
| ⬜ | `UIS:side-effects:Travel:5` | none | – |  |
| ⬜ | `UIS:side-effects:Travel:6` | none | – |  |
| ⬜ | `UIS:side-effects:Travel:7` | none | – |  |
| ⬜ | `UIS:assert.range:Travel:8` | none | – |  |
| ⬜ | `UIS:readonly:Travel:9` | none | – |  |
| ⬜ | `UIS:mandatory:Travel:10` | none | – |  |
| ⬜ | `UIS:field-control:Booking` | none | – |  |
| ⬜ | `UIS:CreateHidden:Booking` | none | – |  |
| ⬜ | `UIS:DeleteHidden:Booking` | none | – |  |
| ⬜ | `UIS:mandatory:Booking:14` | none | – |  |
| ⬜ | `UIS:field-control:BookingSupplement` | none | – |  |
| ⬜ | `UIS:mandatory:BookingSupplement:16` | none | – |  |
| ◐ | `STA:rejectTravel:X` | existing: test/odata.test.ts:147 | – | UI expects rejected |
| ◐ | `STA:rejectTravel:A` | existing: test/odata.test.ts:147 | – |  |
| ◐ | `STA:rejectTravel:O` | existing: test/odata.test.ts:147 | – |  |
| ⬜ | `STA:acceptTravel:X` | none | – |  |
| ⬜ | `STA:acceptTravel:A` | none | – | UI expects rejected |
| ⬜ | `STA:acceptTravel:O` | none | – |  |
| ◐ | `STA:deductDiscount:X` | existing: test/odata.test.ts:214 | – | UI expects rejected |
| ◐ | `STA:deductDiscount:A` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `STA:deductDiscount:O` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:18:t` | existing: test/odata.test.ts:117, test/odata.test.ts:121, test/odata.test.ts:148 | – |  |
| ⬜ | `RUL:rule:srv/travel-service.ts:23:t` | none | – |  |
| ⬜ | `RUL:rule:srv/travel-service.ts:24:t` | none | – |  |
| ⬜ | `RUL:rule:srv/travel-service.ts:29:t` | none | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:36:t` | existing: test/odata.test.ts:117 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:36:f` | existing: test/odata.test.ts:117 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:37:t` | existing: test/odata.test.ts:117 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:37:f` | existing: test/odata.test.ts:117 | – |  |
| ⬜ | `RUL:rule:srv/travel-service.ts:93:t` | none | – |  |
| ⬜ | `RUL:rule:srv/travel-service.ts:93:f` | none | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:99:t` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:99:f` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:105:t` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:105:f` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:106:t` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:106:f` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:107:t` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `RUL:rule:srv/travel-service.ts:107:f` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `FW:deductDiscount:below min` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `FW:deductDiscount:min` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `FW:deductDiscount:max` | existing: test/odata.test.ts:214 | – |  |
| ◐ | `FW:deductDiscount:above max` | existing: test/odata.test.ts:214 | – |  |
| ⬜ | `FW:TravelService.Travel:ro` | none | – |  |
| ⬜ | `FW:TravelService.Travel:BeginDate` | none | – |  |
| ⬜ | `FW:TravelService.Travel:EndDate` | none | – |  |
| ⬜ | `FW:TravelService.Travel:to_Agency` | none | – |  |
| ⬜ | `FW:TravelService.Travel:to_Customer` | none | – |  |
| ⬜ | `FW:TravelService.Booking:ConnectionID` | none | – |  |
| ⬜ | `FW:TravelService.Booking:FlightDate` | none | – |  |
| ⬜ | `FW:TravelService.Booking:FlightPrice` | none | – |  |
| ⬜ | `FW:TravelService.Booking:BookingStatus` | none | – |  |
| ⬜ | `FW:TravelService.Booking:to_Carrier` | none | – |  |
| ⬜ | `FW:TravelService.Booking:to_Customer` | none | – |  |
| ⬜ | `FW:TravelService.BookingSupplement:Price` | none | – |  |
| ⬜ | `FW:TravelService.BookingSupplement:to_Supplement` | none | – |  |
| ⬜ | `DRF:TravelService.Travel:new-activate` | none | – |  |
| ⬜ | `DRF:TravelService.Travel:edit-discard` | none | – |  |
| ⬜ | `DRF:TravelService.Travel:foreign-lock` | none | – |  |
