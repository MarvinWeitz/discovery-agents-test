---
product: access
step: Authorization
status: warn
generated: 2026-11-10T15:00Z
---

# Access map

_Authorization_ · Who can do what: operation × user/role, declared in CDS, and measured against the running app when the CI run sent the probe.



13 operations × 6 users. 4 operations are open to users without a role. **Measured in CI:** 61 cells agree, 0 differ, 5 were unclear and are now settled.

![access matrix](views/matrix.svg)

| Service | Operation | anonymous | rose | martha | amy | admin | alice | Where |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AnalyticsService | TravelAgency READ (PII: Street, PhoneNumber, EMailAddress) | r ✓ | r ✓ | r ✓ | r ✓ | r ✓ | r ✓ | db/master-data.cds:86 |
| AnalyticsService | Passenger READ (PII: FirstName, LastName, Street, …) | r ✓ | r ✓ | r ✓ | r ✓ | r ✓ | r ✓ | db/master-data.cds:73 |
| AnalyticsService | /analytics: 8 other entities READ | a | y | y | y | y | y | srv/analytics-service.cds:9 |
| TravelService | Travel READ | n ✓ | y ✓ | y ✓ | y ✓ | y ✓ | y ✓ | srv/travel-service.cds:11 |
| TravelService | Travel create / edit / delete | n ✓ | n ✓ | n ✓ | y ✓ | y ✓ | y ✓ | srv/travel-service.cds:11 |
| TravelService | Travel createTravelByTemplate | n ✓ | n ✓ | n ✓ | a ✓ | a ✓ | a ✓ | srv/travel-service.cds:11 |
| TravelService | Travel rejectTravel | n ✓ | n ✓ | y ✓ | y ✓ | y ✓ | y ✓ | srv/travel-service.cds:11 |
| TravelService | Travel acceptTravel | n ✓ | n ✓ | y ✓ | y ✓ | y ✓ | y ✓ | srv/travel-service.cds:11 |
| TravelService | Travel deductDiscount | n ✓ | n ✓ | y ✓ | y ✓ | y ✓ | y ✓ | srv/travel-service.cds:11 |
| TravelService | Booking / BookingSupplement (via Travel draft) | n ✓ | a ✓ | a ✓ | y ✓ | y ✓ | y ✓ | srv/travel-service.cds:11 |
| TravelService | TravelAgency READ (PII: Street, PhoneNumber, EMailAddress) | r ✓ | r ✓ | r ✓ | y ✓ | y ✓ | y ✓ | db/master-data.cds:86 |
| TravelService | Passenger READ (PII: FirstName, LastName, Street, …) | r ✓ | r ✓ | r ✓ | y ✓ | y ✓ | y ✓ | db/master-data.cds:73 |
| TravelService | /processor: 8 other entities READ | a | y | y | y | y | y | db/schema.cds:82 |

Ask: `node bin/query.js <out> who-can <operation text>`.

**Deeper:** [access.json](data/access.json)

Read from: `atlas-data.json AUTH, ROLES, MEASURED` · [all products](../index.md)
