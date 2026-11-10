## Impact: change Entity `BookingStatus`

9 things depend on it within 3 steps (`db/schema.cds:72`).

| Layer | Count |
| --- | --- |
| Model | 1 |
| Service | 6 |
| UI | 2 |

### Model

- BookingStatus.texts (Entity, 1 away, via composes BookingStatus) `db/schema.cds:72`

### Service

- AnalyticsService.BookingStatus (ServiceEntity, 1 away, via projects_on BookingStatus) `srv/analytics-service.cds:63`
- TravelService.BookingStatus (ServiceEntity, 1 away, via projects_on BookingStatus) `db/schema.cds:72`
- AnalyticsService (Service, 2 away, via exposes AnalyticsService.BookingStatus) `srv/analytics-service.cds:3`
- AnalyticsService.BookingStatus.texts (ServiceEntity, 2 away, via composes AnalyticsService.BookingStatus) `db/schema.cds:72`
- TravelService (Service, 2 away, via exposes TravelService.BookingStatus) `srv/travel-service.cds:3`
- TravelService.BookingStatus.texts (ServiceEntity, 2 away, via composes TravelService.BookingStatus) `db/schema.cds:72`

### UI

- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`
- sap.fe.cap.travel_analytics (UI5App, 3 away, via uses AnalyticsService) `app/travel_analytics/webapp/manifest.json:1`

> Tests to run first: none reaches it: add one
