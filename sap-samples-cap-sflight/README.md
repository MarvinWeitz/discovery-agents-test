---
app: SAP-samples/cap-sflight
source_url: https://github.com/SAP-samples/cap-sflight
license: Apache-2.0
scope: CAP Node.js only
run: 2026-10-30
generator: cap-discovery-toolkit bin/atlas.js
facts: atlas-data.json
---

# SFlight Discovery Atlas

One travel-booking app, read end to end: two Fiori elements apps, one CDS model and a CAP Node.js backend in TypeScript. The repo also ships a Java backend; it is out of scope and ignored here.

| Measure | Value |
| --- | --- |
| UI5 apps | 2 |
| OData services | 2 |
| entities | 13 |
| Node handlers | 13 |
| coding patterns | 32 |
| layer violations | 3 |
| UI rules the server skips | 7 / 16 |
| risks with evidence | 15 |
| equivalence classes | 108 |
| covered today | 12 |
| classes tested | 15% |
| doc statements verified | 12 / 89 |

## Topics

| Code | Topic | Takeaway | File |
| --- | --- | --- | --- |
| ARC | Architecture | 2 UI5 apps on 2 OData services, served by one CAP Node.js process with 13 handlers. **7 business rules are promised by UI annotations only**, not enforced by the server. | [01-arc-architecture.md](topics/01-arc-architecture.md) |
| DAT | Data model | 13 entities: 3 in draft documents, 7 master data, 3 code lists. Personal data in **Passenger, TravelAgency**. | [02-dat-data-model.md](topics/02-dat-data-model.md) |
| DEP | Dependencies | 15 CDS files, 23 file-to-file dependencies. **3 reach past their layer**, 4 put UI annotations straight on the domain. | [03-dep-dependencies.md](topics/03-dep-dependencies.md) |
| FLW | Data flow & events | 3 entities get fields written by handlers; the busiest handler is **on deductDiscount Travel** (travel-service.ts:97). 6 lifecycle events carry server or UI hooks. | [04-flw-data-flow-events.md](topics/04-flw-data-flow-events.md) |
| STA | TravelStatus lifecycle | 3 states, 9 action × state pairs. The UI allows 5, the Node server 8; **3 disagree**. | [05-sta-travelstatus-lifecycle.md](topics/05-sta-travelstatus-lifecycle.md) |
| AUT | Authorization | 6 users (anonymous plus mock users) × 13 operations. **4 operations expose personal data without a role.** 6 cells are exercised by existing tests. | [06-aut-authorization.md](topics/06-aut-authorization.md) |
| PAT | Coding patterns | 32 patterns found by fixed detectors. 2 cause a defect or exposure, 6 work but sit in the wrong place. | [07-pat-coding-patterns.md](topics/07-pat-coding-patterns.md) |
| UIS | UI promises vs server | 16 rules the UI promises, read from the annotations. 8 are enforced by the server or by CAP, 1 only partly; **7 exist only in the UI** and can be bypassed with a plain OData call. | [08-uis-ui-promises-vs-server.md](topics/08-uis-ui-promises-vs-server.md) |
| RSK | Risks | 15 risks: 12 found by rules, 3 by agent review. Highest: **Passenger personal data open to any caller** (score 16). | [09-rsk-risks.md](topics/09-rsk-risks.md) |
| RLS | Rules from agent findings | 5 rules drafted from agent findings: 0 accepted, 5 waiting for review. 4 drafts fire on this app, reproducing agent findings **A12, A8, A7** without AI. | [10-rls-rules-from-agent-findings.md](topics/10-rls-rules-from-agent-findings.md) |
| TST | Test design | 108 equivalence classes in 7 categories; **12 covered by existing tests**. deductDiscount: 19 all-pairs cases instead of 216. | [11-tst-test-design.md](topics/11-tst-test-design.md) |
| COV | Coverage by class | 16 of 108 classes tested (**15%**) by tests that ran in CI; 7 pin today's behaviour with the intended one waiting as a spec test, 0 generated but not run yet, 39 likely (approximate match), **46 untested**. | [12-cov-coverage-by-class.md](topics/12-cov-coverage-by-class.md) |
| API | Interfaces | 2 service roots, 23 entity sets, 4 actions. **20 sets need no role**, including personal data. | [13-api-interfaces.md](topics/13-api-interfaces.md) |

## How to read this

- Evidence is `file:line` in the analysed repository; every risk and rule carries at least one.
- "verify" marks a fact inferred from annotations that still needs a request against a running app.
- Ids are stable between runs of the same commit: G1… rule risks, A1… agent risks, ARC-A… views, UIS:… / AUT:… test classes.
- The same facts drive three outputs: these Markdown files, the PNGs in `images/`, and the interactive `index.html`.

## For AI agents

- Read this file first, then only the topic files you need; each starts with YAML front matter.
- Tables are the authoritative content. Images are renderings of the same tables and add no facts.
- `atlas-data.json` holds every fact in machine-readable form (keys: ARC, ARC_LAYERS, ENT, REL, DAT_ROWS, FILES, DEPS, SANKEY_NODES, SANKEY_LINKS, SWIM, HOOK_EVENTS, HOOK_NODE, HOOK_UI, TR, STATES, ROLES, AUTH, PIIREACH, CHAIN, PARITY, PV, TESTCATS, CLASSES, DD, TEST_NOTE, API, PATTERNS, LAYERS, RISKS, KPIS, SECTIONS, META, COVERAGE, DOCS, RULES).
