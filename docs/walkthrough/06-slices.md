---
piece: 6 of 13
title: Cut vertical slices and rank them by risk
code: lib/analyse/slices.js, lib/analyse/classes.js
runs: bin/discover.js, after all extractors
---

# Piece 6: Slices and risk ranking

Goal: cut the graph into vertical feature slices (UI route → service entity → handler → rule → persisted entity), so that agents and people can work on one feature at a time, and rank the slices so the riskiest comes first.

## Decisions, in run order

### D1. What starts a slice (the seed)
- **What:** a service entity that is **not**:
  - generated without a handler,
  - auto-exposed,
  - a code list,
  - a `.texts` entity,
  - a composition child of another service entity.
- Plus each service that has actions but no seed entity (for example, a job API with only actions).
- **Why:** one business object (a draft root with its children) is one feature. Code lists and texts are shared master data, not features.

### D2. What joins the slice
Starting from the seed, in this order:
1. its service,
2. its compositions, recursively,
3. the projection chain down to persisted entities, and their compositions,
4. associations, projections and compositions transitively, **up to 4 hops**, but never into another seed (master data, code lists and value helps come along),
5. elements and bound actions of every entity in the slice; unbound actions join the first slice of their service, once,
6. UI: routes that show a member, views that bind to one, their apps and UI handlers; views of those apps that bind to nothing specific (Fiori elements extensions),
7. handlers on a member, or on the whole service with no target, plus event subscribers that write to a member; with their rules, events, service calls and file, and the remote systems reached from that file and the files it imports (up to 3 levels),
8. HANA artifacts behind the members (`backed_by`), existing tests that mention a member, and roles required by a member.

### D3. Risk score
- **Factors, each normalised to 0..1** by dividing by the largest value among all slices:
  - churn: commits on the slice's files (piece 5e)
  - centrality: the sum of graph edges of all members
  - external: the number of external services
  - events: the number of events
  - criticality: **always 0.5**, a placeholder until a person or a business interview gives a value
- **Weights:** churn 0.3, centrality 0.25, external 0.2, events 0.15, criticality 0.1.
- Slices are sorted by score and numbered `S01`, `S02`, … Every member node records the slices it belongs to.

### D4. Split large slices
- A slice with **more than 8 handlers** gets sub-slices: one per service entity of the business object (with its projection chain, handlers, rules and routes) and one per action (with its handlers and rules). They are numbered `S01.1`, `S01.2`, …
- An action with no handler is named `action X (no handler found)`.

### D5. Coverage of the inventory
- **Inventory:** UI5 apps, routes, views, UI handlers, services, service entities, entities, elements, actions, events, handlers, rules, external services and HDI artifacts, except generated ones and entities of reuse packages next to the app that nothing here uses.
- **Reported:** the share of the inventory that sits in at least one slice, per type, and the list of unassigned nodes. Also the share of facts with evidence, and the number of facts that are not `high` confidence ("to verify").

### D6. Equivalence-class seeds (`classes.js`)
Classes that need no AI, hung on the fact they come from, so slices that share an element share its tests:
- **Elements:** each enum value valid plus one invalid value; format valid and violated; range inside, below and above; length at the limit and one over; default omitted and given; mandatory missing; calculated or read-only written by the client.
- **Rules:** guard true (rejected or derived) and guard false (accepted or unchanged).
- **Grants:** user with the role allowed, user without it 403, anonymous 401.
- **Draft roots:** new → draft, activate, edit, discard, and edit while another user holds the draft.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| seed = service entity that is not generated, auto-exposed, code list, texts or composition child | slices.js `isSeed` | a feature modelled as a child entity has no slice of its own |
| association depth 4 | slices.js | very deep models stop early |
| remote-system search 3 import levels from the handler file | slices.js | – |
| weights churn 0.3, centrality 0.25, external 0.2, events 0.15, criticality 0.1 | slices.js `WEIGHTS` | – |
| criticality 0.5 for every slice | slices.js `rank` | **placeholder, needs a person's input** |
| split above 8 handlers | slices.js `SPLIT_HANDLERS` | – |
| inventory node types | slices.js `INVENTORY_TYPES` | – |
| class seeds per constraint kind | classes.js | – |

## Output
`run/slices/catalog.json` (slices with members, factors, risk, files, sub-slices), `run/tests/class-seeds.json`, and the coverage part of `run/metrics.json`. The report and diagrams in `run/discovery-report.md` and `run/diagrams/` come from `lib/report/` (Mermaid rendered to PNG/SVG with Playwright).
