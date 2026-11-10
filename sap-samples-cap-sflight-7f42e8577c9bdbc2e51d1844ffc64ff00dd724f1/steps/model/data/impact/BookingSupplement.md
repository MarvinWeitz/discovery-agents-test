## Impact: change Entity `BookingSupplement`

26 things depend on it within 3 steps (`db/schema.cds:51`).

| Layer | Count |
| --- | --- |
| Model | 2 |
| Service | 7 |
| Code | 8 |
| UI | 7 |
| Tests | 2 |

### Model

- Booking (Entity, 1 away, via composes BookingSupplement) `db/schema.cds:33`
- Travel (Entity, 2 away, via composes Booking) `db/schema.cds:12`

### Service

- TravelService.BookingSupplement (ServiceEntity, 1 away, via projects_on BookingSupplement) `db/schema.cds:51`
- AnalyticsService.Bookings (ServiceEntity, 2 away, via projects_on Booking) `srv/analytics-service.cds:9`
- TravelService (Service, 2 away, via exposes TravelService.BookingSupplement) `srv/travel-service.cds:3`
- TravelService.Booking (ServiceEntity, 2 away, via projects_on Booking) `db/schema.cds:33`
- AnalyticsService (Service, 3 away, via exposes AnalyticsService.Bookings) `srv/analytics-service.cds:3`
- AnalyticsService.Travels (ServiceEntity, 3 away, via projects_on Travel) `srv/analytics-service.cds:68`
- TravelService.Travel (ServiceEntity, 3 away, via projects_on Travel) `srv/travel-service.cds:11`

### Code

- before NEW BookingSupplement (Handler, 2 away, via handles TravelService.BookingSupplement) `srv/travel-service.ts:27`
- on DELETE Booking (Handler, 2 away, via reads TravelService.BookingSupplement) `srv/travel-service.ts:48`
- on DELETE BookingSupplement (Handler, 2 away, via handles TravelService.BookingSupplement) `srv/travel-service.ts:49`
- on UPDATE Booking (Handler, 2 away, via reads TravelService.BookingSupplement) `srv/travel-service.ts:46`
- on UPDATE BookingSupplement (Handler, 2 away, via handles TravelService.BookingSupplement) `srv/travel-service.ts:47`
- on UPDATE Travel (Handler, 2 away, via reads TravelService.BookingSupplement) `srv/travel-service.ts:45`
- before NEW Booking (Handler, 3 away, via handles TravelService.Booking) `srv/travel-service.ts:21`
- derivation BookingSupplementID (Rule, 3 away, via enforces before NEW BookingSupplement) `srv/travel-service.ts:29`

### UI

- BookingObjectPage (Route, 3 away, via shows TravelService.Booking) `app/travel_processor/webapp/manifest.json:122`
- BookingsList (Route, 3 away, via shows AnalyticsService.Bookings) `app/travel_analytics/webapp/manifest.json:118`
- BookingsObjectPage (Route, 3 away, via shows AnalyticsService.Bookings) `app/travel_analytics/webapp/manifest.json:123`
- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:20`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:20`
- side-effects · consistent (UiRule, 3 away, via enforced_by on UPDATE Travel) `app/travel_processor/field-control.cds:51`

### Tests

- odata.test.ts (ExistingTest, 2 away, via mentions TravelService.BookingSupplement) `test/odata.test.ts:1`
- OpaJourney.js (travel_processor) (ExistingTest, 3 away, via mentions TravelService.Booking) `app/travel_processor/webapp/test/integration/OpaJourney.js:1`

> Tests to run first: odata.test.ts, OpaJourney.js (travel_processor)
