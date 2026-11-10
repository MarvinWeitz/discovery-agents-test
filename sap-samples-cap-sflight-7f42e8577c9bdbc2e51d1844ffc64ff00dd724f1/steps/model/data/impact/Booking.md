## Impact: change Entity `Booking`

45 things depend on it within 3 steps (`db/schema.cds:33`).

| Layer | Count |
| --- | --- |
| Model | 2 |
| Service | 11 |
| Code | 15 |
| UI | 10 |
| Access | 4 |
| Tests | 3 |

### Model

- BookingSupplement (Entity, 1 away, via composes Booking) `db/schema.cds:51`
- Travel (Entity, 1 away, via composes Booking) `db/schema.cds:12`

### Service

- AnalyticsService.Bookings (ServiceEntity, 1 away, via projects_on Booking) `srv/analytics-service.cds:9`
- TravelService.Booking (ServiceEntity, 1 away, via projects_on Booking) `db/schema.cds:33`
- AnalyticsService (Service, 2 away, via exposes AnalyticsService.Bookings) `srv/analytics-service.cds:3`
- AnalyticsService.Travels (ServiceEntity, 2 away, via projects_on Travel) `srv/analytics-service.cds:68`
- TravelService (Service, 2 away, via exposes TravelService.Booking) `srv/travel-service.cds:3`
- TravelService.BookingSupplement (ServiceEntity, 2 away, via composes TravelService.Booking) `db/schema.cds:51`
- TravelService.Travel (ServiceEntity, 2 away, via projects_on Travel) `srv/travel-service.cds:11`
- acceptTravel (Action, 3 away, via has_action TravelService.Travel) `srv/travel-service.cds:14`
- createTravelByTemplate (Action, 3 away, via has_action TravelService.Travel) `srv/travel-service.cds:12`
- deductDiscount (Action, 3 away, via has_action TravelService.Travel) `srv/travel-service.cds:15`
- rejectTravel (Action, 3 away, via has_action TravelService.Travel) `srv/travel-service.cds:13`

### Code

- before NEW Booking (Handler, 2 away, via handles TravelService.Booking) `srv/travel-service.ts:21`
- on DELETE Booking (Handler, 2 away, via handles TravelService.Booking) `srv/travel-service.ts:48`
- on DELETE BookingSupplement (Handler, 2 away, via reads TravelService.Booking) `srv/travel-service.ts:49`
- on UPDATE Booking (Handler, 2 away, via handles TravelService.Booking) `srv/travel-service.ts:46`
- on UPDATE BookingSupplement (Handler, 2 away, via reads TravelService.Booking) `srv/travel-service.ts:47`
- on UPDATE Travel (Handler, 2 away, via reads TravelService.Booking) `srv/travel-service.ts:45`
- before acceptTravel/rejectTravel Travel (Handler, 3 away, via handles TravelService.Travel) `srv/travel-service.ts:86`
- before CREATE Travel (Handler, 3 away, via handles TravelService.Travel) `srv/travel-service.ts:16`
- before NEW BookingSupplement (Handler, 3 away, via handles TravelService.BookingSupplement) `srv/travel-service.ts:27`
- before SAVE Travel (Handler, 3 away, via handles TravelService.Travel) `srv/travel-service.ts:34`
- derivation BookingDate (Rule, 3 away, via enforces before NEW Booking) `srv/travel-service.ts:24`
- derivation BookingID (Rule, 3 away, via enforces before NEW Booking) `srv/travel-service.ts:23`
- on acceptTravel (Handler, 3 away, via writes TravelService.Travel) `srv/travel-service.ts:95`
- on deductDiscount (Handler, 3 away, via writes TravelService.Travel) `srv/travel-service.ts:97`
- on rejectTravel (Handler, 3 away, via writes TravelService.Travel) `srv/travel-service.ts:96`

### UI

- BookingObjectPage (Route, 2 away, via shows TravelService.Booking) `app/travel_processor/webapp/manifest.json:122`
- BookingsList (Route, 2 away, via shows AnalyticsService.Bookings) `app/travel_analytics/webapp/manifest.json:118`
- BookingsObjectPage (Route, 2 away, via shows AnalyticsService.Bookings) `app/travel_analytics/webapp/manifest.json:123`
- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`
- sap.fe.cap.travel_analytics (UI5App, 3 away, via uses AnalyticsService) `app/travel_analytics/webapp/manifest.json:1`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:20`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:20`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:51`
- TravelList (Route, 3 away, via shows TravelService.Travel) `app/travel_processor/webapp/manifest.json:112`
- TravelObjectPage (Route, 3 away, via shows TravelService.Travel) `app/travel_processor/webapp/manifest.json:117`

### Access

- admin (Role, 3 away, via requires TravelService.Travel) ``
- authenticated-user (Role, 3 away, via requires TravelService.Travel) ``
- processor (Role, 3 away, via requires TravelService.Travel) ``
- reviewer (Role, 3 away, via requires TravelService.Travel) ``

### Tests

- odata.test.ts (ExistingTest, 2 away, via mentions TravelService.Booking) `test/odata.test.ts:1`
- OpaJourney.js (travel_processor) (ExistingTest, 2 away, via mentions TravelService.Booking) `app/travel_processor/webapp/test/integration/OpaJourney.js:1`
- OpaJourney.js (travel_analytics) (ExistingTest, 3 away, via mentions TravelService.Travel) `app/travel_analytics/webapp/test/integration/OpaJourney.js:1`

> Tests to run first: odata.test.ts, OpaJourney.js (travel_processor), OpaJourney.js (travel_analytics)
