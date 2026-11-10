## Impact: change Entity `FlightConnection`

6 things depend on it within 3 steps (`db/master-data.cds:53`).

| Layer | Count |
| --- | --- |
| Service | 4 |
| UI | 2 |

### Service

- AnalyticsService.FlightConnection (ServiceEntity, 1 away, via projects_on FlightConnection) `db/master-data.cds:53`
- TravelService.FlightConnection (ServiceEntity, 1 away, via projects_on FlightConnection) `db/master-data.cds:53`
- AnalyticsService (Service, 2 away, via exposes AnalyticsService.FlightConnection) `srv/analytics-service.cds:3`
- TravelService (Service, 2 away, via exposes TravelService.FlightConnection) `srv/travel-service.cds:3`

### UI

- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`
- sap.fe.cap.travel_analytics (UI5App, 3 away, via uses AnalyticsService) `app/travel_analytics/webapp/manifest.json:1`

> Tests to run first: none reaches it: add one
