# Phase 1 discovery report: @capire/sflight

Run 2026-10-30T10:31Z on commit `7f42e8577c`. Everything below was extracted by tools; no LLM was used. Facts from static code analysis are marked medium confidence and still need review.

## Headline

- **2 feature slices** cut from the model, ranked by risk. Top slice: **S01 TravelService / Travel** (risk 0.6).
- **Inventory coverage 99%**: 131 of 132 inventory items belong to at least one slice.
- **Evidence ratio 99%**: share of graph facts with a file:line reference.
- **35 lint findings** (9 errors) from cds lint and UI5 linter.
- **158 equivalence-class seeds** in 71 groups, derived from CDS constraints, roles, drafts and handler rules.

## Inventory

| Item type | Count | In a slice |
| --- | --- | --- |
| Element | 57 | 57 |
| ServiceEntity | 23 | 22 |
| Entity | 13 | 13 |
| Handler | 13 | 13 |
| Rule | 11 | 11 |
| Route | 5 | 5 |
| Action | 4 | 4 |
| Service | 2 | 2 |
| UI5App | 2 | 2 |
| View | 2 | 2 |

Graph size: 256 nodes, 407 edges. Git history: 1412 commits. CAP plugins: @cap-js/hana, @cap-js/cds-test, @cap-js/cds-typer, @cap-js/cds-types, @cap-js/sqlite, @sap/cds-dk. HDI artifacts: 0. mta.yaml: yes.

## Architecture overview (C4 level 2 to 3)

Each service box holds the entities it exposes; arrows without a label mean "projects on" the persisted entity.

![Architecture overview (C4 level 2 to 3)](diagrams/01-architecture-overview-c4-level-2-to-3.png)

<sub>Source: [diagrams/01-architecture-overview-c4-level-2-to-3.mmd](diagrams/01-architecture-overview-c4-level-2-to-3.mmd) · [SVG](diagrams/01-architecture-overview-c4-level-2-to-3.svg)</sub>

## Slice catalog

| Slice | Seed | Risk | Churn (commits) | Edges | Handlers | Rules | Routes | Existing tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | TravelService / Travel | 0.6 | 113 | 516 | 13 | 11 | 3 | 3 |
| S01.1 | ↳ Travel lifecycle | | | | 4 | 4 | 2 | |
| S01.2 | ↳ Booking lifecycle | | | | 3 | 2 | 1 | |
| S01.3 | ↳ BookingSupplement lifecycle | | | | 3 | 1 | 0 | |
| S01.4 | ↳ action createTravelByTemplate (no handler found) | | | | 0 | 0 | 0 | |
| S01.5 | ↳ action rejectTravel | | | | 2 | 1 | 0 | |
| S01.6 | ↳ action acceptTravel | | | | 2 | 1 | 0 | |
| S01.7 | ↳ action deductDiscount | | | | 1 | 4 | 0 | |
| S02 | AnalyticsService / Travels | 0.386 | 75 | 283 | 0 | 0 | 2 | 2 |

Slices with more than 8 handlers are split into sub-slices, one per business-object node and per action. Sub-slices are the unit of the Phase 3 deep-dive.

Risk = 0.3 churn + 0.25 centrality + 0.2 external calls + 0.15 events + 0.1 business criticality, each normalised to 0..1. Business criticality is a placeholder of 0.5 until the Phase 0 interview.

### S01 TravelService / Travel

#### S01.1 Travel lifecycle

![S01.1 Travel lifecycle](diagrams/02-s01-1-travel-lifecycle.png)

<sub>Source: [diagrams/02-s01-1-travel-lifecycle.mmd](diagrams/02-s01-1-travel-lifecycle.mmd) · [SVG](diagrams/02-s01-1-travel-lifecycle.svg)</sub>

#### S01.2 Booking lifecycle

![S01.2 Booking lifecycle](diagrams/03-s01-2-booking-lifecycle.png)

<sub>Source: [diagrams/03-s01-2-booking-lifecycle.mmd](diagrams/03-s01-2-booking-lifecycle.mmd) · [SVG](diagrams/03-s01-2-booking-lifecycle.svg)</sub>

#### S01.3 BookingSupplement lifecycle

![S01.3 BookingSupplement lifecycle](diagrams/04-s01-3-bookingsupplement-lifecycle.png)

<sub>Source: [diagrams/04-s01-3-bookingsupplement-lifecycle.mmd](diagrams/04-s01-3-bookingsupplement-lifecycle.mmd) · [SVG](diagrams/04-s01-3-bookingsupplement-lifecycle.svg)</sub>

#### S01.4 action createTravelByTemplate (no handler found)

![S01.4 action createTravelByTemplate (no handler found)](diagrams/05-s01-4-action-createtravelbytemplate-no-handler-found.png)

<sub>Source: [diagrams/05-s01-4-action-createtravelbytemplate-no-handler-found.mmd](diagrams/05-s01-4-action-createtravelbytemplate-no-handler-found.mmd) · [SVG](diagrams/05-s01-4-action-createtravelbytemplate-no-handler-found.svg)</sub>

#### S01.5 action rejectTravel

![S01.5 action rejectTravel](diagrams/06-s01-5-action-rejecttravel.png)

<sub>Source: [diagrams/06-s01-5-action-rejecttravel.mmd](diagrams/06-s01-5-action-rejecttravel.mmd) · [SVG](diagrams/06-s01-5-action-rejecttravel.svg)</sub>

#### S01.6 action acceptTravel

![S01.6 action acceptTravel](diagrams/07-s01-6-action-accepttravel.png)

<sub>Source: [diagrams/07-s01-6-action-accepttravel.mmd](diagrams/07-s01-6-action-accepttravel.mmd) · [SVG](diagrams/07-s01-6-action-accepttravel.svg)</sub>

#### S01.7 action deductDiscount

![S01.7 action deductDiscount](diagrams/08-s01-7-action-deductdiscount.png)

<sub>Source: [diagrams/08-s01-7-action-deductdiscount.mmd](diagrams/08-s01-7-action-deductdiscount.mmd) · [SVG](diagrams/08-s01-7-action-deductdiscount.svg)</sub>

Files: `srv/travel-service.cds`, `db/schema.cds`, `db/master-data.cds`, `app/travel_processor/field-control.cds`, `app/travel_processor/webapp/manifest.json`, `app/travel_processor/webapp/ext/fragment/CustomSection.fragment.xml`, `app/travel_processor/webapp/ext/fragment/Trees4Tickets.fragment.xml`, `srv/travel-service.ts`, `app/travel_analytics/webapp/test/integration/OpaJourney.js`, `app/travel_processor/webapp/test/integration/OpaJourney.js`, `test/odata.test.ts`

### S02 AnalyticsService / Travels

![S02 AnalyticsService / Travels](diagrams/09-s02-analyticsservice-travels.png)

<sub>Source: [diagrams/09-s02-analyticsservice-travels.mmd](diagrams/09-s02-analyticsservice-travels.mmd) · [SVG](diagrams/09-s02-analyticsservice-travels.svg)</sub>

Files: `srv/analytics-service.cds`, `db/schema.cds`, `db/master-data.cds`, `app/travel_processor/field-control.cds`, `app/travel_analytics/webapp/manifest.json`, `app/travel_processor/webapp/test/integration/OpaJourney.js`, `test/odata.test.ts`

## Equivalence-class seeds

| On | Technique | Classes | Evidence |
| --- | --- | --- | --- |
| sap.fe.cap.travel.Airline.AirlineID | equivalence partitioning + boundaries | AirlineID length = 3<br/>AirlineID length = 4 | `db/master-data.cds:10` |
| sap.fe.cap.travel.Airline.Name | equivalence partitioning + boundaries | Name length = 40<br/>Name length = 41 | `db/master-data.cds:11` |
| sap.fe.cap.travel.Airport.AirportID | equivalence partitioning + boundaries | AirportID length = 3<br/>AirportID length = 4 | `db/master-data.cds:18` |
| sap.fe.cap.travel.Airport.Name | equivalence partitioning + boundaries | Name length = 40<br/>Name length = 41 | `db/master-data.cds:19` |
| sap.fe.cap.travel.Airport.City | equivalence partitioning + boundaries | City length = 40<br/>City length = 41 | `db/master-data.cds:20` |
| sap.fe.cap.travel.Supplement.SupplementID | equivalence partitioning + boundaries | SupplementID length = 10<br/>SupplementID length = 11 | `db/master-data.cds:26` |
| sap.fe.cap.travel.Supplement.Description | equivalence partitioning + boundaries | Description length = 1024<br/>Description length = 1025 | `db/master-data.cds:29` |
| sap.fe.cap.travel.Flight.AirlineID | equivalence partitioning + boundaries | AirlineID length = 3<br/>AirlineID length = 4 | `db/master-data.cds:38` |
| sap.fe.cap.travel.Flight.ConnectionID | equivalence partitioning + boundaries | ConnectionID length = 4<br/>ConnectionID length = 5 | `db/master-data.cds:40` |
| sap.fe.cap.travel.Flight.PlaneType | equivalence partitioning + boundaries | PlaneType length = 10<br/>PlaneType length = 11 | `db/master-data.cds:44` |
| sap.fe.cap.travel.FlightConnection.ConnectionID | equivalence partitioning + boundaries | ConnectionID length = 4<br/>ConnectionID length = 5 | `db/master-data.cds:58` |
| sap.fe.cap.travel.FlightConnection.AirlineID | equivalence partitioning + boundaries | AirlineID length = 3<br/>AirlineID length = 4 | `db/master-data.cds:59` |
| sap.fe.cap.travel.FlightConnection.DistanceUnit | equivalence partitioning + boundaries | DistanceUnit length = 3<br/>DistanceUnit length = 4 | `db/master-data.cds:65` |
| sap.fe.cap.travel.Passenger.CustomerID | equivalence partitioning + boundaries | CustomerID length = 6<br/>CustomerID length = 7 | `db/master-data.cds:74` |
| sap.fe.cap.travel.Passenger.FirstName | equivalence partitioning + boundaries | FirstName length = 40<br/>FirstName length = 41 | `db/master-data.cds:75` |
| sap.fe.cap.travel.Passenger.LastName | equivalence partitioning + boundaries | LastName length = 40<br/>LastName length = 41 | `db/master-data.cds:76` |
| sap.fe.cap.travel.Passenger.Title | equivalence partitioning + boundaries | Title length = 10<br/>Title length = 11 | `db/master-data.cds:77` |
| sap.fe.cap.travel.Passenger.Street | equivalence partitioning + boundaries | Street length = 60<br/>Street length = 61 | `db/master-data.cds:78` |
| sap.fe.cap.travel.Passenger.PostalCode | equivalence partitioning + boundaries | PostalCode length = 10<br/>PostalCode length = 11 | `db/master-data.cds:79` |
| sap.fe.cap.travel.Passenger.City | equivalence partitioning + boundaries | City length = 40<br/>City length = 41 | `db/master-data.cds:80` |
| sap.fe.cap.travel.Passenger.PhoneNumber | equivalence partitioning + boundaries | PhoneNumber length = 30<br/>PhoneNumber length = 31 | `db/master-data.cds:82` |
| sap.fe.cap.travel.Passenger.EMailAddress | equivalence partitioning + boundaries | EMailAddress length = 256<br/>EMailAddress length = 257 | `db/master-data.cds:83` |
| sap.fe.cap.travel.TravelAgency.AgencyID | equivalence partitioning + boundaries | AgencyID length = 6<br/>AgencyID length = 7 | `db/master-data.cds:87` |
| sap.fe.cap.travel.TravelAgency.Name | equivalence partitioning + boundaries | Name length = 80<br/>Name length = 81 | `db/master-data.cds:88` |
| sap.fe.cap.travel.TravelAgency.Street | equivalence partitioning + boundaries | Street length = 60<br/>Street length = 61 | `db/master-data.cds:89` |
| sap.fe.cap.travel.TravelAgency.PostalCode | equivalence partitioning + boundaries | PostalCode length = 10<br/>PostalCode length = 11 | `db/master-data.cds:90` |
| sap.fe.cap.travel.TravelAgency.City | equivalence partitioning + boundaries | City length = 40<br/>City length = 41 | `db/master-data.cds:91` |
| sap.fe.cap.travel.TravelAgency.PhoneNumber | equivalence partitioning + boundaries | PhoneNumber length = 30<br/>PhoneNumber length = 31 | `db/master-data.cds:93` |
| sap.fe.cap.travel.TravelAgency.EMailAddress | equivalence partitioning + boundaries | EMailAddress length = 256<br/>EMailAddress length = 257 | `db/master-data.cds:94` |
| sap.fe.cap.travel.TravelAgency.WebAddress | equivalence partitioning + boundaries | WebAddress length = 256<br/>WebAddress length = 257 | `db/master-data.cds:95` |
| sap.fe.cap.travel.SupplementType.code | equivalence partitioning + boundaries | code = Beverage<br/>code = Meal<br/>code = Luggage<br/>code = Extra<br/>code not in enum<br/>code length = 2<br/>code length = 3 | `db/master-data.cds:104` |
| sap.fe.cap.travel.Travel.TravelID | equivalence partitioning + boundaries | TravelID omitted -> default 0<br/>TravelID given explicitly<br/>TravelID written by client is ignored | `db/schema.cds:14` |
| sap.fe.cap.travel.Travel.BeginDate | equivalence partitioning + boundaries | BeginDate missing | `db/schema.cds:15` |
| sap.fe.cap.travel.Travel.EndDate | equivalence partitioning + boundaries | EndDate missing | `db/schema.cds:16` |
| sap.fe.cap.travel.Travel.BookingFee | equivalence partitioning + boundaries | BookingFee omitted -> default 0<br/>BookingFee given explicitly | `db/schema.cds:17` |
| sap.fe.cap.travel.Travel.TotalPrice | equivalence partitioning + boundaries | TotalPrice written by client is ignored | `db/schema.cds:18` |
| sap.fe.cap.travel.Travel.CurrencyCode | equivalence partitioning + boundaries | CurrencyCode omitted -> default "EUR"<br/>CurrencyCode given explicitly | `db/schema.cds:19` |
| sap.fe.cap.travel.Travel.Description | equivalence partitioning + boundaries | Description length = 1024<br/>Description length = 1025 | `db/schema.cds:20` |
| sap.fe.cap.travel.Travel.TravelStatus | equivalence partitioning + boundaries | TravelStatus omitted -> default "O"<br/>TravelStatus given explicitly<br/>TravelStatus written by client is ignored | `db/schema.cds:21` |
| sap.fe.cap.travel.Travel.to_Agency | equivalence partitioning + boundaries | to_Agency missing | `db/schema.cds:22` |
| sap.fe.cap.travel.Travel.to_Customer | equivalence partitioning + boundaries | to_Customer missing | `db/schema.cds:23` |
| sap.fe.cap.travel.Travel.GoGreen | equivalence partitioning + boundaries | GoGreen omitted -> default false<br/>GoGreen given explicitly | `db/schema.cds:87` |
| sap.fe.cap.travel.Travel.GreenFee | equivalence partitioning + boundaries | GreenFee written by client is ignored | `db/schema.cds:88` |
| sap.fe.cap.travel.Travel.TreesPlanted | equivalence partitioning + boundaries | TreesPlanted written by client is ignored | `db/schema.cds:89` |
| sap.fe.cap.travel.Booking.ConnectionID | equivalence partitioning + boundaries | ConnectionID length = 4<br/>ConnectionID length = 5<br/>ConnectionID missing | `db/schema.cds:37` |
| sap.fe.cap.travel.Booking.FlightDate | equivalence partitioning + boundaries | FlightDate missing | `db/schema.cds:38` |
| sap.fe.cap.travel.Booking.FlightPrice | equivalence partitioning + boundaries | FlightPrice missing | `db/schema.cds:39` |
| sap.fe.cap.travel.Booking.BookingStatus | equivalence partitioning + boundaries | BookingStatus omitted -> default "N"<br/>BookingStatus given explicitly<br/>BookingStatus missing | `db/schema.cds:41` |
| sap.fe.cap.travel.Booking.to_Carrier | equivalence partitioning + boundaries | to_Carrier missing | `db/schema.cds:43` |
| sap.fe.cap.travel.Booking.to_Customer | equivalence partitioning + boundaries | to_Customer missing | `db/schema.cds:44` |
| sap.fe.cap.travel.BookingSupplement.Price | equivalence partitioning + boundaries | Price missing | `db/schema.cds:54` |
| sap.fe.cap.travel.BookingSupplement.to_Supplement | equivalence partitioning + boundaries | to_Supplement missing | `db/schema.cds:58` |
| sap.fe.cap.travel.BookingStatus.code | equivalence partitioning + boundaries | code = New<br/>code = Booked<br/>code = Canceled<br/>code not in enum<br/>code length = 1<br/>code length = 2 | `db/schema.cds:73` |
| sap.fe.cap.travel.TravelStatus.code | equivalence partitioning + boundaries | code = Open<br/>code = Accepted<br/>code = Canceled<br/>code not in enum<br/>code length = 1<br/>code length = 2 | `db/schema.cds:83` |
| sap.fe.cap.travel.TravelStatus.fieldControl | equivalence partitioning + boundaries | fieldControl = Inapplicable<br/>fieldControl = ReadOnly<br/>fieldControl = Optional<br/>fieldControl = Mandatory<br/>fieldControl not in enum<br/>fieldControl computed from inputs<br/>fieldControl written by client is ignored | `app/travel_processor/field-control.cds:14` |
| srv/travel-service.ts:18 | decision table (guard true/false) | TravelID always derived by the server<br/>TravelID sent by client is overwritten | `srv/travel-service.ts:18` |
| srv/travel-service.ts:23 | decision table (guard true/false) | BookingID always derived by the server<br/>BookingID sent by client is overwritten | `srv/travel-service.ts:23` |
| srv/travel-service.ts:24 | decision table (guard true/false) | BookingDate always derived by the server<br/>BookingDate sent by client is overwritten | `srv/travel-service.ts:24` |
| srv/travel-service.ts:29 | decision table (guard true/false) | BookingSupplementID always derived by the server<br/>BookingSupplementID sent by client is overwritten | `srv/travel-service.ts:29` |
| srv/travel-service.ts:36 | decision table (guard true/false) | BeginDate < today() is true -> rejected: Begin Date must not be before today.<br/>BeginDate < today() is false -> accepted | `srv/travel-service.ts:36` |
| srv/travel-service.ts:37 | decision table (guard true/false) | BeginDate > EndDate is true -> rejected: End Date must be after Begin Date.<br/>BeginDate > EndDate is false -> accepted | `srv/travel-service.ts:37` |
| srv/travel-service.ts:93 | decision table (guard true/false) | !isDraft && existingDraft \|\| isDraft && existingDraft?.InProcessByUser !== req.user.id is true -> rejected: The travel is locked by ${existingDraft.InProcessByUser}.<br/>!isDraft && existingDraft \|\| isDraft && existingDraft?.InProcessByUser !== req.user.id is false -> accepted | `srv/travel-service.ts:93` |
| srv/travel-service.ts:99 | decision table (guard true/false) | TravelStatus.code != 'A' and BookingFee != null is true -> undefined derived<br/>TravelStatus.code != 'A' and BookingFee != null is false -> undefined unchanged | `srv/travel-service.ts:99` |
| srv/travel-service.ts:105 | decision table (guard true/false) | !succeeded && !travel is true -> rejected: Travel "${travel.ID}" does not exist; may have been deleted meanwhile.<br/>!succeeded && !travel is false -> accepted | `srv/travel-service.ts:105` |
| srv/travel-service.ts:106 | decision table (guard true/false) | !succeeded && travel.status === TravelStatusCode.Accepted is true -> rejected: Travel "${travel.ID}" has been approved already.<br/>!succeeded && travel.status === TravelStatusCode.Accepted is false -> accepted | `srv/travel-service.ts:106` |
| srv/travel-service.ts:107 | decision table (guard true/false) | !succeeded && travel.BookingFee == null is true -> rejected: No discount possible, as travel "${travel.ID}" does not yet have a booking fee added.<br/>!succeeded && travel.BookingFee == null is false -> accepted | `srv/travel-service.ts:107` |
| TravelService.Travel | role x operation matrix | user with role authenticated-user -> READ allowed<br/>user without role authenticated-user -> 403<br/>anonymous user -> 401 | `srv/travel-service.cds:11` |
| TravelService.Travel | role x operation matrix | user with role reviewer -> rejectTravel,acceptTravel,deductDiscount allowed<br/>user without role reviewer -> 403<br/>anonymous user -> 401 | `srv/travel-service.cds:11` |
| TravelService.Travel | role x operation matrix | user with role processor -> * allowed<br/>user without role processor -> 403<br/>anonymous user -> 401 | `srv/travel-service.cds:11` |
| TravelService.Travel | role x operation matrix | user with role admin -> * allowed<br/>user without role admin -> 403<br/>anonymous user -> 401 | `srv/travel-service.cds:11` |
| TravelService.Travel | state transitions (draft) | new -> draft created<br/>draft -> activate (save)<br/>active -> edit -> draft<br/>draft -> discard<br/>edit while another user holds the draft | `srv/travel-service.cds:11` |

## Lint findings

| Tool | Severity | Rule | Where | Message |
| --- | --- | --- | --- | --- |
| ui5-lint | error | no-deprecated-api | `app/travel_processor/webapp/test/integration/Opa.qunit.html:12` | Bootstrap parameter 'data-sap-ui-animation' should be replaced with 'data-sap-ui-animation-mode' |
| ui5-lint | error | no-deprecated-api | `app/travel_processor/webapp/test/integration/Opa.qunit.html:9` | Missing bootstrap parameter 'data-sap-ui-async' |
| ui5-lint | error | no-deprecated-api | `app/travel_processor/webapp/manifest.json:97` | Usage of deprecated parameter 'synchronizationMode' of constructor 'sap/ui/model/odata/v4/ODataModel' |
| ui5-lint | error | no-deprecated-api | `app/travel_processor/webapp/manifest.json:70` | Use of deprecated property 'sap.ui5/resources/js' |
| ui5-lint | error | no-outdated-manifest-version | `app/travel_processor/webapp/manifest.json:2` | manifest.json must be migrated to Version 2 |
| ui5-lint | error | no-deprecated-api | `app/travel_analytics/webapp/test/integration/Opa.qunit.html:12` | Bootstrap parameter 'data-sap-ui-animation' should be replaced with 'data-sap-ui-animation-mode' |
| ui5-lint | error | no-deprecated-api | `app/travel_analytics/webapp/test/integration/Opa.qunit.html:9` | Missing bootstrap parameter 'data-sap-ui-async' |
| ui5-lint | error | no-deprecated-api | `app/travel_analytics/webapp/manifest.json:99` | Usage of deprecated parameter 'synchronizationMode' of constructor 'sap/ui/model/odata/v4/ODataModel' |
| ui5-lint | error | no-outdated-manifest-version | `app/travel_analytics/webapp/manifest.json:2` | manifest.json must be migrated to Version 2 |
| ui5-lint | warning | prefer-test-starter | `app/travel_processor/webapp/test/testsuite.qunit.js:5` | To save boilerplate code and ensure compliance with UI5 2.x best practices, please migrate to the Test Starter concept |
| ui5-lint | warning | prefer-test-starter | `app/travel_processor/webapp/test/testsuite.qunit.html:5` | To save boilerplate code and ensure compliance with UI5 2.x best practices, please migrate to the Test Starter concept |
| ui5-lint | warning | prefer-test-starter | `app/travel_processor/webapp/test/integration/Opa.qunit.js:10` | To save boilerplate code and ensure compliance with UI5 2.x best practices, please migrate to the Test Starter concept |
| ui5-lint | warning | no-deprecated-api | `app/travel_processor/webapp/test/integration/Opa.qunit.html:14` | Outdated spelling of bootstrap parameter: 'data-sap-ui-resourceroots'; should be written as 'data-sap-ui-resource-roots' |
| ui5-lint | warning | no-deprecated-api | `app/travel_processor/webapp/test/integration/Opa.qunit.html:13` | Outdated spelling of bootstrap parameter: 'data-sap-ui-compatVersion'; should be written as 'data-sap-ui-compat-version' |
| ui5-lint | warning | prefer-test-starter | `app/travel_processor/webapp/test/integration/Opa.qunit.html:9` | To save boilerplate code and ensure compliance with UI5 2.x best practices, please migrate to the Test Starter concept |
| ui5-lint | warning | no-deprecated-api | `app/travel_processor/webapp/index.html:26` | Outdated spelling of bootstrap parameter: 'data-sap-ui-flexibilityServices'; should be written as 'data-sap-ui-flexibility-services' |
| ui5-lint | warning | no-deprecated-api | `app/travel_processor/webapp/index.html:23` | Outdated spelling of bootstrap parameter: 'data-sap-ui-compatVersion'; should be written as 'data-sap-ui-compat-version' |
| ui5-lint | warning | no-deprecated-api | `app/travel_processor/webapp/index.html:22` | Outdated spelling of bootstrap parameter: 'data-sap-ui-resourceroots'; should be written as 'data-sap-ui-resource-roots' |
| ui5-lint | warning | no-deprecated-api | `app/travel_processor/webapp/index.html:21` | Outdated spelling of bootstrap parameter: 'data-sap-ui-oninit'; should be written as 'data-sap-ui-on-init' |
| ui5-lint | warning | prefer-test-starter | `app/travel_analytics/webapp/test/testsuite.qunit.js:5` | To save boilerplate code and ensure compliance with UI5 2.x best practices, please migrate to the Test Starter concept |
| ui5-lint | warning | prefer-test-starter | `app/travel_analytics/webapp/test/testsuite.qunit.html:5` | To save boilerplate code and ensure compliance with UI5 2.x best practices, please migrate to the Test Starter concept |
| ui5-lint | warning | prefer-test-starter | `app/travel_analytics/webapp/test/integration/Opa.qunit.js:8` | To save boilerplate code and ensure compliance with UI5 2.x best practices, please migrate to the Test Starter concept |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/test/integration/Opa.qunit.html:14` | Outdated spelling of bootstrap parameter: 'data-sap-ui-resourceroots'; should be written as 'data-sap-ui-resource-roots' |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/test/integration/Opa.qunit.html:13` | Outdated spelling of bootstrap parameter: 'data-sap-ui-compatVersion'; should be written as 'data-sap-ui-compat-version' |
| ui5-lint | warning | prefer-test-starter | `app/travel_analytics/webapp/test/integration/Opa.qunit.html:9` | To save boilerplate code and ensure compliance with UI5 2.x best practices, please migrate to the Test Starter concept |
| ui5-lint | warning | csp-unsafe-inline-script | `app/travel_analytics/webapp/test/flpSandbox.html:78` | Use of unsafe inline script |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/test/flpSandbox.html:73` | Outdated spelling of bootstrap parameter: 'data-sap-ui-frameOptions'; should be written as 'data-sap-ui-frame-options' |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/test/flpSandbox.html:72` | Outdated spelling of bootstrap parameter: 'data-sap-ui-resourceroots'; should be written as 'data-sap-ui-resource-roots' |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/test/flpSandbox.html:70` | Outdated spelling of bootstrap parameter: 'data-sap-ui-compatVersion'; should be written as 'data-sap-ui-compat-version' |
| ui5-lint | warning | csp-unsafe-inline-script | `app/travel_analytics/webapp/test/flpSandbox.html:25` | Use of unsafe inline script |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/index.html:27` | Outdated spelling of bootstrap parameter: 'data-sap-ui-frameOptions'; should be written as 'data-sap-ui-frame-options' |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/index.html:26` | Outdated spelling of bootstrap parameter: 'data-sap-ui-flexibilityServices'; should be written as 'data-sap-ui-flexibility-services' |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/index.html:23` | Outdated spelling of bootstrap parameter: 'data-sap-ui-compatVersion'; should be written as 'data-sap-ui-compat-version' |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/index.html:22` | Outdated spelling of bootstrap parameter: 'data-sap-ui-resourceroots'; should be written as 'data-sap-ui-resource-roots' |
| ui5-lint | warning | no-deprecated-api | `app/travel_analytics/webapp/index.html:21` | Outdated spelling of bootstrap parameter: 'data-sap-ui-oninit'; should be written as 'data-sap-ui-on-init' |

## Not in any slice

- ServiceEntity `AnalyticsService.BookingStatus` (srv/analytics-service.cds:63)

## What tools cannot tell us (Phase 0 questions)

- Which slice matters most to the business (sets the criticality factor).
- The intended architecture and coding rules, so the reflexion check can flag violations.
- 19 medium- or low-confidence facts from static analysis to spot-check.
