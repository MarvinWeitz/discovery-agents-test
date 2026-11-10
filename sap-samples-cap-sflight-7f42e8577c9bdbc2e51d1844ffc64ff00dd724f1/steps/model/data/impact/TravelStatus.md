## Impact: change Entity `TravelStatus`

9 things depend on it within 3 steps (`db/schema.cds:82`).

| Layer | Count |
| --- | --- |
| Model | 1 |
| Service | 6 |
| UI | 2 |

### Model

- TravelStatus.texts (Entity, 1 away, via composes TravelStatus) `db/schema.cds:82`

### Service

- AnalyticsService.TravelStatus (ServiceEntity, 1 away, via projects_on TravelStatus) `db/schema.cds:82`
- TravelService.TravelStatus (ServiceEntity, 1 away, via projects_on TravelStatus) `db/schema.cds:82`
- AnalyticsService (Service, 2 away, via exposes AnalyticsService.TravelStatus) `srv/analytics-service.cds:3`
- AnalyticsService.TravelStatus.texts (ServiceEntity, 2 away, via composes AnalyticsService.TravelStatus) `db/schema.cds:82`
- TravelService (Service, 2 away, via exposes TravelService.TravelStatus) `srv/travel-service.cds:3`
- TravelService.TravelStatus.texts (ServiceEntity, 2 away, via composes TravelService.TravelStatus) `db/schema.cds:82`

### UI

- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`
- sap.fe.cap.travel_analytics (UI5App, 3 away, via uses AnalyticsService) `app/travel_analytics/webapp/manifest.json:1`

> Tests to run first: none reaches it: add one
