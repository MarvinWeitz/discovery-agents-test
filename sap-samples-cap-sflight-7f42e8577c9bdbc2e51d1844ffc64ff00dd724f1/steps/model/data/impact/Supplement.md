## Impact: change Entity `Supplement`

7 things depend on it within 3 steps (`db/master-data.cds:25`).

| Layer | Count |
| --- | --- |
| Model | 1 |
| Service | 3 |
| UI | 1 |
| Tests | 2 |

### Model

- Supplement.texts (Entity, 1 away, via composes Supplement) `db/master-data.cds:25`

### Service

- TravelService.Supplement (ServiceEntity, 1 away, via projects_on Supplement) `db/master-data.cds:25`
- TravelService (Service, 2 away, via exposes TravelService.Supplement) `srv/travel-service.cds:3`
- TravelService.Supplement.texts (ServiceEntity, 2 away, via composes TravelService.Supplement) `db/master-data.cds:25`

### UI

- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`

### Tests

- odata.test.ts (ExistingTest, 2 away, via mentions TravelService.Supplement) `test/odata.test.ts:1`
- OpaJourney.js (travel_processor) (ExistingTest, 2 away, via mentions TravelService.Supplement) `app/travel_processor/webapp/test/integration/OpaJourney.js:1`

> Tests to run first: odata.test.ts, OpaJourney.js (travel_processor)
