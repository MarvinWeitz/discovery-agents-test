# Why each view, list and file is there

Every picture, list and diagram in the step products answers a question someone has. This file keeps the reasoning: the question, why it matters, why this form, and what to do with the answer. Source: `lib/products/reasons.js`.

## Run timeline

_The run itself_ · [card](run/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| timeline.svg | Where did the run spend its time, and which stage failed or was skipped? | A failed or skipped stage leaves every product after it incomplete, so its numbers must not be trusted. | Gantt bars on one time axis: duration and order at a glance; colour = how the stage knows (static, measured, AI, failed). | Read what the failed or skipped stage said in the list below before trusting later cards. |
| stages | What did each stage report? | The one-line message of each stage is the first place to look when a number seems off. | Run order, never truncated: the toolkit has a fixed set of stages. | Follow a stage to its product card, or rerun with that stage switched on. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `stages.json` | The manifest stages as recorded; trend dashboards and the PR comment read it. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Project passport

_Probe and intake_ · [card](project/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| profiles.svg | What runs in development, test and production: database, auth, messaging? | Mocked auth or SQLite in production, or a test profile that differs from production, makes tests prove less than they seem. | Profile × service matrix with fixed rows: grey = mock or local, blue = real platform service. | If production shows a mock, treat every access result as unproven until it is fixed. |
| plugins | Which CAP plugins change behaviour without code in this repository? | Plugins add handlers, protocols or database behaviour that no source file shows. | Plain list: plugins are few. | Read the plugin docs for anything the Behaviour matrix cannot explain. |
| problems | Which questions could CAP not answer about the project? | Every unanswered probe question is a gap in all later products. | Plain list of the probe errors as CAP reported them. | Fix the setup (install, profile, credentials) and rerun. |
| services | Which services exist, where are they served, and which have their own code? | A service without its own code is generic CAP: its behaviour comes from the model alone, so tests and review focus elsewhere. | One row per service, sorted by name; filter "own code" to see the generic ones. | Open the Behaviour matrix for services with code, the API surface for the others. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `project.json` | What CAP itself answered (cds.env, services, folders): the source of truth every other stage reads instead of guessing from files. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Model map

_cds compile (CSN)_ · [card](model/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| entities | Which entities spread a change furthest? | Changing a widely used entity touches projections, handlers, screens and tests at once; knowing the reach before a change is cheaper than finding it after. | Stacked bars per entity, one colour per layer, sorted by total reach; only direct dependencies (3 steps, no associations) so the numbers mean "must be checked", not "might be touched". | Open "impact" for the entity, or the explorer to walk it, before changing it. |
| projections | Which service entities change when a database entity changes? | A field added or removed on the database entity shows up (or breaks) in every projection on it. | Two columns, database entity → service entities, so one change reads left to right. | Check each projection on the right when you change the entity on the left. |
| er | How are the entities related? | Compositions delete and deep-insert together; associations only refer. That decides what a change or a delete takes with it. | Mermaid ER diagram, drawn only up to 15 entities: past that it is unreadable and the explorer draws the part you pick. | Treat a composition parent and its children as one unit in changes and tests. |

| File | Why it is there |
| --- | --- |
| `explorer.html` | Model and impact explorer: pick any node and see what depends on it, drawn as graph, rings or layers. Only the affected part is drawn. |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `model-graph.json` | The compact graph (nodes, edges, evidence) the explorer and the query CLI walk. |
| `impact.json` | Reach per entity by layer, for trends and the PR comment. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |
| `impact/` | One Markdown impact list per entity, so an agent or reviewer can read the reach of one entity without a browser. |

## API surface

_EDMX, OpenAPI, AsyncAPI_ · [card](api/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| surface | Which entity sets accept which operations, and which need no role? | An entity set open to any caller is the first thing an attacker or an auditor looks at. | Entity set × operation matrix, open ones first; amber = no role needed. | Confirm each amber cell is meant to be public, then check it in the Access map. |
| services | Which services exist and where are their API documents? | Clients, contract tests and reviewers need the standard documents, not our summary. | One row per service with links to EDMX, OpenAPI, AsyncAPI and the Redoc page. | Hand the OpenAPI file to client or contract tests; read it in Redoc. |

| File | Why it is there |
| --- | --- |
| `openapi-AnalyticsService.html` | Redoc, the standard OpenAPI reader: endpoints, parameters and schemas of one service. |
| `openapi-TravelService.html` | Redoc, the standard OpenAPI reader: endpoints, parameters and schemas of one service. |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `edmx/AnalyticsService.xml` | OData $metadata as CAP compiles it: what every OData client reads. |
| `edmx/TravelService.xml` | OData $metadata as CAP compiles it: what every OData client reads. |
| `openapi/AnalyticsService.json` | OpenAPI 3 per service (@cap-js/openapi): input for client generators, contract tests and API catalogues. |
| `openapi/TravelService.json` | OpenAPI 3 per service (@cap-js/openapi): input for client generators, contract tests and API catalogues. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Behaviour matrix

_Handler AST_ · [card](behaviour/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| matrix | Where does custom code run: for which entity, phase and event? | Everything without a handler is generic CAP behaviour; the code that differs from it is where bugs and business rules live. | Entity × phase-event matrix: before (blue), on (amber), after (purple); a cell says handlers · rules. | Read the handlers of the busiest cells first; give each rule a test. |
| handlers | Which handler does what, and where is it? | Reviews and tests need the exact code location and the rules inside each handler. | One row per handler, handlers with most rules first. | Filter by entity before changing it; every rule here should have a test in Coverage. |
| sequence | In which order does code run for the busiest entity? | Before, on and after handlers run in a fixed order; a value set in one phase and overwritten in another is a common surprise. | Mermaid sequence for one entity, at most 12 handlers; all of them in the handlers list. | Check that no later phase undoes what an earlier one enforced. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `handlers.json` | Every handler with phase, events, target and rules, from the handler AST. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Screen map

_UI5 and Fiori annotations_ · [card](screens/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| verdicts.svg | How many UI promises does the server not enforce? | A field the UI hides or locks but the server accepts can be changed by any OData client: the UI is not a security boundary. | Bars over the four fixed verdicts, red first. | Fix the red ones on the server (@readonly, @mandatory, a before handler, a restriction). |
| screens | Which page shows which entity, and where are the UI-only promises? | A UI-only promise matters most on a page users actually use; this connects the verdict to a screen. | App → page → entity columns; page colour = worst verdict; pages with most UI-only promises first. | Open the page, then its promises below. |
| promises | What exactly does each UI promise say, and what does the server do? | To fix or test a promise you need the field, the UI rule and the server behaviour side by side. | One row per promise, UI-only first. | Turn each UI-only promise into a server rule or a test that pins today's behaviour. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `ui-promises.json` | Every UI promise with UI rule, server rule and verdict. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Access map

_Authorization_ · [card](access/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| matrix | Who may do what, and does the running app agree? | Authorization mistakes are the costliest bugs here; the model says what should happen, CI measures what does. | Operation × user matrix; operations that differ from the measurement or need no role come first. | Fix every ≠ cell; confirm every "r" (no role needed) is meant to be open. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `access.json` | Static matrix, users and measured results together, for the who-can query and the PR comment. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Code findings

_Lint, Opengrep, rules_ · [card](checks/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| files | In which files do findings pile up? | Findings concentrate; fixing the worst few files removes most of the noise and risk. | Treemap: size = number of findings, colour = worst severity; with many files only the top ones are drawn. | Start with red, then large amber tiles. |
| findings | What exactly was found, and where? | Each finding needs a location and a kind before someone can fix or dismiss it. | One row per finding, most severe first; filter by kind or folder. | Open the location; dismissals go into the rules library so they do not come back. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `checks.sarif` | SARIF 2.1.0, the OASIS format VS Code's SARIF Viewer, GitHub code scanning and most CI tools read. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Hotspots and change coupling

_Git history_ · [card](history/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| hotspots | Where does the code change most? | Files that change often and a lot are where new bugs appear; with the findings they show where to invest first. | Treemap: size = lines changed, colour = number of commits; only the app's own CAP folders, no Java, no generated files. | Review and test hotspots first, especially those with findings. |
| coupling | Which files change together? | If two files almost always change in the same commit, a change to one usually needs the other: impact from history, next to impact from the model. | Pairs with at least 3 shared commits and 50% coupling, strongest first. | When you change file A, check file B; if the model shows no link between them, look for a hidden one. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `hotspots.json` | Commits, lines, authors and last change per file. |
| `coupling.json` | Coupled file pairs with shared commits and coupling degree. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Evidence ledger

_Findings and gaps_ · [card](findings/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| ladder.svg | How much of what the run claims is proven? | A measured finding was seen in the running app; a static one is read from code; an AI one is a suspicion until a test confirms it. Decisions should weigh them differently. | Stacked bars per kind, one colour per method. | Prefer measured findings for decisions; send suspected ones to the gap list below. |
| severity.svg | Which layer holds the severe findings? | Severe findings in access or service layers reach users directly; the same count in tests matters less. | Severity × layer matrix with fixed rows. | Work the red row from the left. |
| gaps | What could the run not decide, and who can? | An open question is a blind spot in every product; naming who can close it (a measurement, an AI pass, a person) turns it into a task. | One row per question, open first; filter by who can answer. | Run CI for "measured", static+ai for "ai", and ask the owner for "human". |
| findings | What does the run claim, how was it found, and how sure is it? | The evidence behind every claim must be checkable, or the claim is an opinion. | One row per claim, most severe first; filter by method or status. | Check the evidence of anything you act on. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `findings.jsonl` | Every claim with evidence, method and status (JSON Schema in schema/). |
| `gaps.jsonl` | Every open or answered question with who can answer it (JSON Schema in schema/). |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Classification tree

_Test design_ · [card](testdesign/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| tree.svg | How were the tests designed for each category? | Each category uses a known technique (decision table, state transition, pairwise, …); seeing it explains why these classes and not others. | Category → technique → three sample classes; the full list is below. | Challenge a technique that does not fit; add a category that is missing. |
| categories | How many classes does each category have, and how many are covered today? | A category with many classes and no coverage is a whole kind of behaviour nobody tests. | One row per category, largest first; never truncated, the categories are fixed. | Start with the largest uncovered category in Coverage. |
| pairwise | Which input combinations must be tested for the action with most factors? | Testing every combination explodes; pairwise covers every pair of values with a few rows and finds most interaction bugs. | One row per test case, factors as columns. | Use each row as a test case. |
| classes | Which equivalence classes exist, with input and expected outcome? | An equivalence class is one test worth writing; the list is the test backlog. | One row per class; filter by category or by how it is tested today. | Pick untested classes from Coverage → Test next. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `classes.json` | Every equivalence class with input, expected outcome and today's status. |
| `class-seeds.json` | The facts each class was derived from, so a class can be traced back to code or model. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Test results

_Generated tests and test run_ · [card](tests/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| files | Which test files fail? | A failing file points to one area of the app. | Stacked bars per file: passed, failed, skipped (spec tests that pin today's behaviour and the intended one). | Open the failing file's tests below. |
| tests | Which tests failed, and with what message? | The first failure message is usually enough to tell a real bug from a test problem. | One row per test, failures first. | Fix the bug or the test; a skipped spec test is a known risk, not a failure. |
| requests | Which requests did the tests actually send, as whom, with which outcome? | It shows what the tests really exercised, independent of what they claim; untouched entities are untested whatever the test names say. | Entity × event pairs, most frequent first. | Compare with the Access map: users or operations never sent are blind spots. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `results.ctrf.json` | Results in CTRF, one JSON shape every CI and dashboard can read. |
| `generated.json` | The generated tests with their classes. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |

## Coverage by class

_Coverage_ · [card](coverage/README.md)

| Shows | Question | Why it matters | Why this form | Next |
| --- | --- | --- | --- | --- |
| classes.svg | How much of each category is tested, and how? | Line coverage says which code ran; class coverage says which business cases are checked, which is what matters for a change. | Stacked bars per category: tested, generated, spec only, likely, failing, untested. | Pick from the largest grey part. |
| next | Which untested case should be tested next? | Effort goes furthest on cases that are both risky and valuable. | Highest score (risk × value) first. | Write or generate the test; rerun to see the class turn green. |
| never | Which handler rules does no test ever run? | A rule no test runs can break silently. | One row per rule, from the measured run. | Write a test that triggers each rule. |

| File | Why it is there |
| --- | --- |
| `browse.html` | Every list of this product with search, filters, sort and copy as Markdown or CSV; cards only show the top rows. |
| `coverage.json` | Classes per status and the measured rules. |
| `lists/` | All rows of each list as plain JSON, the same as browse.html shows, for agents and scripts. |
