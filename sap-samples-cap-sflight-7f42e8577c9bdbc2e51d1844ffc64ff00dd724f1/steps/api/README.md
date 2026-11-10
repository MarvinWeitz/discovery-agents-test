---
product: api
step: EDMX, OpenAPI, AsyncAPI
status: ok
generated: 2026-11-10T15:00Z
---

# API surface

_EDMX, OpenAPI, AsyncAPI_ · Every service, entity set, operation and action as standard API documents (OData EDMX, OpenAPI 3, AsyncAPI), with the guard on each.



2 services · 23 entity sets · 137 OpenAPI paths · 0 AsyncAPI channels.

- **AnalyticsService** `/analytics`: [edmx](data/edmx/AnalyticsService.xml) · [openapi](data/openapi/AnalyticsService.json) · [read it in Redoc](openapi-AnalyticsService.html)
- **TravelService** `/processor`: [edmx](data/edmx/TravelService.xml) · [openapi](data/openapi/TravelService.json) · [read it in Redoc](openapi-TravelService.html)

![service surface](views/surface.svg)

| Service | Entity set | Operations | Guard | Note |
| --- | --- | --- | --- | --- |
| AnalyticsService | Passenger | GET | open | PII: FirstName, LastName, Street, PhoneNumber, EMailAddress · auto-exposed |
| AnalyticsService | TravelAgency | GET | open | PII: Street, PhoneNumber, EMailAddress · auto-exposed |
| AnalyticsService | Airline | GET | open | auto-exposed |
| AnalyticsService | Airport | GET | open | auto-exposed |
| AnalyticsService | Bookings | GET | open |  |
| AnalyticsService | BookingStatus | GET | open |  |
| AnalyticsService | Flight | GET | open | auto-exposed |
| AnalyticsService | FlightConnection | GET | open | auto-exposed |
| AnalyticsService | Travels | GET | open |  |
| AnalyticsService | TravelStatus | GET | open | auto-exposed |
| TravelService | Passenger | GET | open | PII: FirstName, LastName, Street, PhoneNumber, EMailAddress · auto-exposed |
| TravelService | TravelAgency | GET | open | PII: Street, PhoneNumber, EMailAddress · auto-exposed |
| TravelService | Airline | GET | open | auto-exposed |
| TravelService | Airport | GET | open | auto-exposed |
| TravelService | Booking | via Travel draft | auth? |  |
| TravelService | BookingStatus | GET | open | auto-exposed |
| TravelService | BookingSupplement | via Travel draft | auth? |  |
| TravelService | Flight | GET | open | auto-exposed |
| TravelService | FlightConnection | GET | open | auto-exposed |
| TravelService | Supplement | GET | open | auto-exposed |
| TravelService | SupplementType | GET | open | auto-exposed |
| TravelService | Travel | GET POST PATCH DELETE | auth | draft |
| TravelService | TravelStatus | GET | open | auto-exposed |

_No events declared: nothing for AsyncAPI to describe._

Not produced: @cap-js/asyncapi: No events found in the service.; @cap-js/asyncapi: No events found in the service.


**Deeper:** [openapi-AnalyticsService.html](openapi-AnalyticsService.html) · [openapi-TravelService.html](openapi-TravelService.html) · [edmx/AnalyticsService.xml](data/edmx/AnalyticsService.xml) · [edmx/TravelService.xml](data/edmx/TravelService.xml) · [openapi/AnalyticsService.json](data/openapi/AnalyticsService.json) · [openapi/TravelService.json](data/openapi/TravelService.json)

Read from: `run/csn.json`, `run/edmx/`, `atlas-data.json API` · [all products](../index.md)
