---
product: model
step: cds compile (CSN)
status: ok
generated: 2026-11-10T15:49Z
---

# Model map

_cds compile (CSN)_ · Entities, compositions, associations and the projection chain from database to service, plus what depends on each entity when it changes.



13 database entities in `sap.fe.cap.travel` · 29 service entities · 6 compositions · 21 associations.

**Explore it:** [interactive model and impact explorer](explorer.html) (pick any entity, see what it affects; graph, rings or layers).

### What depends on each entity

![What depends on each entity (3 steps)](views/entities.svg)

| Entity | Exposed by | Depends on it | Model | Service | Code | UI | Access | Tests | Detail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Travel | AnalyticsService, TravelService | 53 | 2 | 11 | 20 | 13 | 4 | 3 | [impact](data/impact/Travel.md) |
| Booking | AnalyticsService, TravelService | 45 | 2 | 11 | 15 | 10 | 4 | 3 | [impact](data/impact/Booking.md) |
| BookingSupplement | TravelService | 26 | 2 | 7 | 8 | 7 | 0 | 2 | [impact](data/impact/BookingSupplement.md) |
| BookingStatus | AnalyticsService, TravelService | 9 | 1 | 6 | 0 | 2 | 0 | 0 | [impact](data/impact/BookingStatus.md) |
| TravelStatus | AnalyticsService, TravelService | 9 | 1 | 6 | 0 | 2 | 0 | 0 | [impact](data/impact/TravelStatus.md) |
| Flight | AnalyticsService, TravelService | 8 | 0 | 4 | 0 | 2 | 0 | 2 | [impact](data/impact/Flight.md) |
| Supplement | TravelService | 7 | 1 | 3 | 0 | 1 | 0 | 2 | [impact](data/impact/Supplement.md) |
| Airline | AnalyticsService, TravelService | 6 | 0 | 4 | 0 | 2 | 0 | 0 | [impact](data/impact/Airline.md) |
| Airport | AnalyticsService, TravelService | 6 | 0 | 4 | 0 | 2 | 0 | 0 | [impact](data/impact/Airport.md) |
| FlightConnection | AnalyticsService, TravelService | 6 | 0 | 4 | 0 | 2 | 0 | 0 | [impact](data/impact/FlightConnection.md) |

**Top 10 of 13 entities** by depends on it. [Browse all 13 with filters](browse.html#entities) · [entities.json](data/lists/entities.json)

### Projection chain

![Projection chain: database entity → service entities](views/projections.svg)

| Database entity | Service entity | Service |
| --- | --- | --- |
| Airline | AnalyticsService.Airline | AnalyticsService |
| Airline | TravelService.Airline | TravelService |
| Airport | AnalyticsService.Airport | AnalyticsService |
| Airport | TravelService.Airport | TravelService |
| Booking | AnalyticsService.Bookings | AnalyticsService |
| Booking | TravelService.Booking | TravelService |
| BookingStatus | AnalyticsService.BookingStatus | AnalyticsService |
| BookingStatus | TravelService.BookingStatus | TravelService |
| BookingSupplement | TravelService.BookingSupplement | TravelService |
| Flight | AnalyticsService.Flight | AnalyticsService |

**Top 10 of 23 projections** by database entity (ascending). [Browse all 23 with filters](browse.html#projections) · [projections.json](data/lists/projections.json)

### Entity relationships

```mermaid
erDiagram
  Supplement }o--|| SupplementType : "refers to"
  Flight }o--|| Airline : "refers to"
  Flight }o--|| FlightConnection : "refers to"
  FlightConnection }o--|| Airport : "refers to"
  FlightConnection }o--|| Airport : "refers to"
  FlightConnection }o--|| Airline : "refers to"
  Travel }o--|| TravelStatus : "refers to"
  Travel }o--|| TravelAgency : "refers to"
  Travel }o--|| Passenger : "refers to"
  Travel ||--o{ Booking : "composes"
  Booking }o--|| BookingStatus : "refers to"
  Booking ||--o{ BookingSupplement : "composes"
  Booking }o--|| Airline : "refers to"
  Booking }o--|| Passenger : "refers to"
  Booking }o--|| Travel : "refers to"
  Booking }o--|| Flight : "refers to"
  BookingSupplement }o--|| Booking : "refers to"
  BookingSupplement }o--|| Travel : "refers to"
  BookingSupplement }o--|| Supplement : "refers to"
```

Ask the same from the command line: `node bin/query.js <out> impact <Entity> [--depth 3] [--assoc]`.

**Deeper:** [explorer.html](explorer.html) · [browse.html](browse.html) · [model-graph.json](data/model-graph.json) · [impact.json](data/impact.json)

Read from: `run/csn.json`, `run/graph/` · [all products](../index.md)
