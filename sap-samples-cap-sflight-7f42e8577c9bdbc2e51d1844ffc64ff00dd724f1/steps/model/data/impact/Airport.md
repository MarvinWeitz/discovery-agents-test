## Impact: change Entity `Airport`

6 things depend on it within 3 steps (`db/master-data.cds:17`).

| Layer | Count |
| --- | --- |
| Service | 4 |
| UI | 2 |

### Service

- AnalyticsService.Airport (ServiceEntity, 1 away, via projects_on Airport) `db/master-data.cds:17`
- TravelService.Airport (ServiceEntity, 1 away, via projects_on Airport) `db/master-data.cds:17`
- AnalyticsService (Service, 2 away, via exposes AnalyticsService.Airport) `srv/analytics-service.cds:3`
- TravelService (Service, 2 away, via exposes TravelService.Airport) `srv/travel-service.cds:3`

### UI

- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`
- sap.fe.cap.travel_analytics (UI5App, 3 away, via uses AnalyticsService) `app/travel_analytics/webapp/manifest.json:1`

> Tests to run first: none reaches it: add one
