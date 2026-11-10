## Impact: change Entity `Flight`

8 things depend on it within 3 steps (`db/master-data.cds:33`).

| Layer | Count |
| --- | --- |
| Service | 4 |
| UI | 2 |
| Tests | 2 |

### Service

- AnalyticsService.Flight (ServiceEntity, 1 away, via projects_on Flight) `db/master-data.cds:33`
- TravelService.Flight (ServiceEntity, 1 away, via projects_on Flight) `db/master-data.cds:33`
- AnalyticsService (Service, 2 away, via exposes AnalyticsService.Flight) `srv/analytics-service.cds:3`
- TravelService (Service, 2 away, via exposes TravelService.Flight) `srv/travel-service.cds:3`

### UI

- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`
- sap.fe.cap.travel_analytics (UI5App, 3 away, via uses AnalyticsService) `app/travel_analytics/webapp/manifest.json:1`

### Tests

- odata.test.ts (ExistingTest, 2 away, via mentions AnalyticsService.Flight) `test/odata.test.ts:1`
- OpaJourney.js (travel_processor) (ExistingTest, 2 away, via mentions AnalyticsService.Flight) `app/travel_processor/webapp/test/integration/OpaJourney.js:1`

> Tests to run first: odata.test.ts, OpaJourney.js (travel_processor)
