## Impact: change Entity `Travel`

53 things depend on it within 3 steps (`db/schema.cds:12`).

| Layer | Count |
| --- | --- |
| Model | 2 |
| Service | 11 |
| Code | 20 |
| UI | 13 |
| Access | 4 |
| Tests | 3 |

### Model

- Booking (Entity, 1 away, via composes Travel) `db/schema.cds:33`
- BookingSupplement (Entity, 2 away, via composes Booking) `db/schema.cds:51`

### Service

- AnalyticsService.Travels (ServiceEntity, 1 away, via projects_on Travel) `srv/analytics-service.cds:68`
- TravelService.Travel (ServiceEntity, 1 away, via projects_on Travel) `srv/travel-service.cds:11`
- acceptTravel (Action, 2 away, via has_action TravelService.Travel) `srv/travel-service.cds:14`
- AnalyticsService (Service, 2 away, via exposes AnalyticsService.Travels) `srv/analytics-service.cds:3`
- AnalyticsService.Bookings (ServiceEntity, 2 away, via projects_on Booking) `srv/analytics-service.cds:9`
- createTravelByTemplate (Action, 2 away, via has_action TravelService.Travel) `srv/travel-service.cds:12`
- deductDiscount (Action, 2 away, via has_action TravelService.Travel) `srv/travel-service.cds:15`
- rejectTravel (Action, 2 away, via has_action TravelService.Travel) `srv/travel-service.cds:13`
- TravelService (Service, 2 away, via exposes TravelService.Travel) `srv/travel-service.cds:3`
- TravelService.Booking (ServiceEntity, 2 away, via composes TravelService.Travel) `db/schema.cds:33`
- TravelService.BookingSupplement (ServiceEntity, 3 away, via composes TravelService.Booking) `db/schema.cds:51`

### Code

- before acceptTravel/rejectTravel Travel (Handler, 2 away, via handles TravelService.Travel) `srv/travel-service.ts:86`
- before CREATE Travel (Handler, 2 away, via handles TravelService.Travel) `srv/travel-service.ts:16`
- before SAVE Travel (Handler, 2 away, via handles TravelService.Travel) `srv/travel-service.ts:34`
- on acceptTravel (Handler, 2 away, via writes TravelService.Travel) `srv/travel-service.ts:95`
- on deductDiscount (Handler, 2 away, via writes TravelService.Travel) `srv/travel-service.ts:97`
- on DELETE Booking (Handler, 2 away, via reads TravelService.Travel) `srv/travel-service.ts:48`
- on DELETE BookingSupplement (Handler, 2 away, via reads TravelService.Travel) `srv/travel-service.ts:49`
- on rejectTravel (Handler, 2 away, via writes TravelService.Travel) `srv/travel-service.ts:96`
- on UPDATE Booking (Handler, 2 away, via reads TravelService.Travel) `srv/travel-service.ts:46`
- on UPDATE BookingSupplement (Handler, 2 away, via reads TravelService.Travel) `srv/travel-service.ts:47`
- on UPDATE Travel (Handler, 2 away, via handles TravelService.Travel) `srv/travel-service.ts:45`
- before NEW Booking (Handler, 3 away, via handles TravelService.Booking) `srv/travel-service.ts:21`
- conditional-write @99 (Rule, 3 away, via enforces on deductDiscount) `srv/travel-service.ts:99`
- derivation TravelID (Rule, 3 away, via enforces before CREATE Travel) `srv/travel-service.ts:18`
- rejection @105 (Rule, 3 away, via enforces on deductDiscount) `srv/travel-service.ts:105`
- rejection @106 (Rule, 3 away, via enforces on deductDiscount) `srv/travel-service.ts:106`
- rejection @107 (Rule, 3 away, via enforces on deductDiscount) `srv/travel-service.ts:107`
- rejection @36 (Rule, 3 away, via enforces before SAVE Travel) `srv/travel-service.ts:36`
- rejection @37 (Rule, 3 away, via enforces before SAVE Travel) `srv/travel-service.ts:37`
- rejection @93 (Rule, 3 away, via enforces before acceptTravel/rejectTravel Travel) `srv/travel-service.ts:93`

### UI

- TravelList (Route, 2 away, via shows TravelService.Travel) `app/travel_processor/webapp/manifest.json:112`
- TravelObjectPage (Route, 2 away, via shows TravelService.Travel) `app/travel_processor/webapp/manifest.json:117`
- acceptTravel · ui-only (UiRule, 3 away, via checked_in before acceptTravel/rejectTravel Travel) `app/travel_processor/field-control.cds:41`
- BookingObjectPage (Route, 3 away, via shows TravelService.Booking) `app/travel_processor/webapp/manifest.json:122`
- BookingsList (Route, 3 away, via shows AnalyticsService.Bookings) `app/travel_analytics/webapp/manifest.json:118`
- BookingsObjectPage (Route, 3 away, via shows AnalyticsService.Bookings) `app/travel_analytics/webapp/manifest.json:123`
- deductDiscount · partial (UiRule, 3 away, via checked_in on deductDiscount) `app/travel_processor/field-control.cds:45`
- rejectTravel · ui-only (UiRule, 3 away, via checked_in before acceptTravel/rejectTravel Travel) `app/travel_processor/field-control.cds:37`
- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`
- sap.fe.cap.travel_analytics (UI5App, 3 away, via uses AnalyticsService) `app/travel_analytics/webapp/manifest.json:1`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:20`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:20`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:51`

### Access

- admin (Role, 2 away, via requires TravelService.Travel) ``
- authenticated-user (Role, 2 away, via requires TravelService.Travel) ``
- processor (Role, 2 away, via requires TravelService.Travel) ``
- reviewer (Role, 2 away, via requires TravelService.Travel) ``

### Tests

- odata.test.ts (ExistingTest, 2 away, via mentions TravelService.Travel) `test/odata.test.ts:1`
- OpaJourney.js (travel_analytics) (ExistingTest, 2 away, via mentions TravelService.Travel) `app/travel_analytics/webapp/test/integration/OpaJourney.js:1`
- OpaJourney.js (travel_processor) (ExistingTest, 2 away, via mentions TravelService.Travel) `app/travel_processor/webapp/test/integration/OpaJourney.js:1`

> Tests to run first: odata.test.ts, OpaJourney.js (travel_analytics), OpaJourney.js (travel_processor)
