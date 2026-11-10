## Impact: change Entity `SupplementType`

5 things depend on it within 3 steps (`db/master-data.cds:103`).

| Layer | Count |
| --- | --- |
| Model | 1 |
| Service | 3 |
| UI | 1 |

### Model

- SupplementType.texts (Entity, 1 away, via composes SupplementType) `db/master-data.cds:103`

### Service

- TravelService.SupplementType (ServiceEntity, 1 away, via projects_on SupplementType) `db/master-data.cds:103`
- TravelService (Service, 2 away, via exposes TravelService.SupplementType) `srv/travel-service.cds:3`
- TravelService.SupplementType.texts (ServiceEntity, 2 away, via composes TravelService.SupplementType) `db/master-data.cds:103`

### UI

- sap.fe.cap.travel (UI5App, 3 away, via uses TravelService) `app/travel_processor/webapp/manifest.json:1`

> Tests to run first: none reaches it: add one
