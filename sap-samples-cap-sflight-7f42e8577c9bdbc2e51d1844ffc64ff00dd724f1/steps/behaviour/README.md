---
product: behaviour
step: Handler AST
status: ok
generated: 2026-11-10T15:00Z
---

# Behaviour matrix

_Handler AST_ · Which code runs for which entity, event and phase, which rules it applies and which helpers it calls.



13 handlers on 3 entities · 11 rules (4 derivation, 6 rejection, 1 conditional-write) · 2 helpers.

![behaviour matrix](views/matrix.svg)

| Phase | Events | Entity | Rules | Where |
| --- | --- | --- | --- | --- |
| before | CREATE | Travel | derivation TravelID | srv/travel-service.ts:16 |
| before | NEW | Booking | derivation BookingID, derivation BookingDate | srv/travel-service.ts:21 |
| before | NEW | BookingSupplement | derivation BookingSupplementID | srv/travel-service.ts:27 |
| before | SAVE | Travel | rejection, rejection | srv/travel-service.ts:34 |
| on | UPDATE | Travel |  | srv/travel-service.ts:45 |
| on | UPDATE | Booking |  | srv/travel-service.ts:46 |
| on | UPDATE | BookingSupplement |  | srv/travel-service.ts:47 |
| on | DELETE | Booking |  | srv/travel-service.ts:48 |
| on | DELETE | BookingSupplement |  | srv/travel-service.ts:49 |
| before | acceptTravel, rejectTravel | Travel | rejection | srv/travel-service.ts:86 |
| on | acceptTravel | Travel |  | srv/travel-service.ts:95 |
| on | rejectTravel | Travel |  | srv/travel-service.ts:96 |
| on | deductDiscount | Travel | conditional-write, rejection, rejection, rejection | srv/travel-service.ts:97 |

### Request lifecycle: Travel

```mermaid
sequenceDiagram
  participant Client
  participant CAP as CAP runtime
  participant Code as handlers for Travel
  participant DB
  Client->>CAP: CREATE Travel
  CAP->>Code: before (srv/travel-service.ts:16)
  Note over Code: derivation TravelID
  Client->>CAP: SAVE Travel
  CAP->>Code: before (srv/travel-service.ts:34)
  Note over Code: rejection
  Note over Code: rejection
  Client->>CAP: acceptTravel/rejectTravel Travel
  CAP->>Code: before (srv/travel-service.ts:86)
  Note over Code: rejection
  Client->>CAP: UPDATE Travel
  CAP->>Code: on (srv/travel-service.ts:45)
  Code->>DB: query
  Client->>CAP: acceptTravel Travel
  CAP->>Code: on (srv/travel-service.ts:95)
  Code->>DB: query
  Client->>CAP: rejectTravel Travel
  CAP->>Code: on (srv/travel-service.ts:96)
  Code->>DB: query
  Client->>CAP: deductDiscount Travel
  CAP->>Code: on (srv/travel-service.ts:97)
  Note over Code: conditional-write
  Note over Code: rejection
  Note over Code: rejection
  Note over Code: rejection
  Code->>DB: query
```

**Deeper:** [handlers.json](data/handlers.json)

Read from: `run/graph/ (Handler, Rule, Helper)` · [all products](../index.md)
