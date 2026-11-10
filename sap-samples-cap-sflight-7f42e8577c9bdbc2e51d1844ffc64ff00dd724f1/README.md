---
app: SAP-samples/cap-sflight
source_url: https://github.com/SAP-samples/cap-sflight
license: Apache-2.0
scope: CAP Node.js only
run: 2026-11-10
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
| UI rules the server skips | 7 / 21 |
| risks with evidence | 15 |
| equivalence classes | 122 |
| covered today | 12 |
| UI checks generated | 22 |
| classes tested | 13% |
| doc statements verified | 12 / 103 |
| auth cells measured differ | 0 |
| P1 next steps | 2 |

## Topics

| Code | Topic | Takeaway | File |
| --- | --- | --- | --- |
| NXT | Next steps | 65 next steps from 10 sections, ranked by impact × likelihood: **2 P1** (do now), 21 P2, 42 P3. Tick several and copy one combined prompt for a coding agent, as a plan, a change, or tests only. | [01-nxt-next-steps.md](topics/01-nxt-next-steps.md) |
| ARC | Architecture | 2 UI5 apps on 2 OData services, served by one CAP Node.js process with 13 handlers. **7 business rules are promised by UI annotations only**, not enforced by the server. | [02-arc-architecture.md](topics/02-arc-architecture.md) |
| DAT | Data model | 13 entities: 3 in draft documents, 7 master data, 3 code lists. Personal data in **Passenger, TravelAgency**. | [03-dat-data-model.md](topics/03-dat-data-model.md) |
| DEP | Dependencies | 15 CDS files, 23 file-to-file dependencies. **3 reach past their layer**, 4 put UI annotations straight on the domain. | [04-dep-dependencies.md](topics/04-dep-dependencies.md) |
| FLW | Data flow & events | 3 entities get fields written by handlers; the busiest handler is **on deductDiscount Travel** (travel-service.ts:97). 6 lifecycle events carry server or UI hooks. | [05-flw-data-flow-events.md](topics/05-flw-data-flow-events.md) |
| STA | TravelStatus lifecycle | 3 states, 9 action × state pairs. The UI allows 5, the Node server 8; **3 disagree**. | [06-sta-travelstatus-lifecycle.md](topics/06-sta-travelstatus-lifecycle.md) |
| AUT | Authorization | 6 users (anonymous plus mock users) × 13 operations. **4 operations expose personal data without a role.** 6 cells are exercised by existing tests. | [07-aut-authorization.md](topics/07-aut-authorization.md) |
| PAT | Coding patterns | 32 patterns found by fixed detectors. 2 cause a defect or exposure, 6 work but sit in the wrong place. | [08-pat-coding-patterns.md](topics/08-pat-coding-patterns.md) |
| UIS | UI promises vs server | 21 rules the UI promises, read from the annotations. 13 are enforced by the server or by CAP, 1 only partly; **7 exist only in the UI** and can be bypassed with a plain OData call. | [09-uis-ui-promises-vs-server.md](topics/09-uis-ui-promises-vs-server.md) |
| UIT | UI tests | 22 UI checks generated from 8 UI promises (9 app starts, OPA5 + sap.fe.test), not run yet. **9 states are guarded by the UI only**; 8 promises are not testable in the UI (reasons listed). | [10-uit-ui-tests.md](topics/10-uit-ui-tests.md) |
| RSK | Risks | 15 risks: 12 found by rules, 3 by agent review. Highest: **Passenger personal data open to any caller** (score 16). | [11-rsk-risks.md](topics/11-rsk-risks.md) |
| RLS | Rules from agent findings | 13 rules drafted from agent findings: 0 accepted, 13 waiting for review. 4 drafts fire on this app, reproducing agent findings **A12, A8, A7** without AI. | [12-rls-rules-from-agent-findings.md](topics/12-rls-rules-from-agent-findings.md) |
| TST | Test design | 122 equivalence classes in 7 categories; **12 covered by existing tests**. deductDiscount: 19 all-pairs cases instead of 216. | [13-tst-test-design.md](topics/13-tst-test-design.md) |
| COV | Coverage by class | 16 of 122 classes tested (**13%**) by tests that ran in CI; 7 pin today's behaviour with the intended one waiting as a spec test, 0 generated but not run yet, 41 likely (approximate match), **58 untested**. | [14-cov-coverage-by-class.md](topics/14-cov-coverage-by-class.md) |
| API | Interfaces | 2 service roots, 23 entity sets, 4 actions. **20 sets need no role**, including personal data. | [15-api-interfaces.md](topics/15-api-interfaces.md) |
| RTM | Runtime check | The running app (cds 10.1.0) registered **13** handlers from its own code: 13 match what the static parser found. Service paths: 2 of 2 as predicted. Plugins registering handlers: @cap-js/db-service. | [16-rtm-runtime-check.md](topics/16-rtm-runtime-check.md) |
| MSR | Measured in CI | Authorization: CAP answered **66** requests; 61 cells agree with the static matrix, 5 settle an unclear cell. Tests sent **110** requests from 4 test files as 6 users. Rules reached by any test: **9 of 11** (2 never run). | [17-msr-measured-in-ci.md](topics/17-msr-measured-in-ci.md) |

## How to read this

- Evidence is `file:line` in the analysed repository; every risk and rule carries at least one.
- "verify" marks a fact inferred from annotations that still needs a request against a running app.
- Ids are stable between runs of the same commit: G1… rule risks, A1… agent risks, ARC-A… views, UIS:… / AUT:… test classes.
- The same facts drive three outputs: these Markdown files, the PNGs in `images/`, and the interactive `index.html`.

## For AI agents

- Read this file first, then only the topic files you need; each starts with YAML front matter.
- Tables are the authoritative content. Images are renderings of the same tables and add no facts.
- Start with the NXT topic file for what to do next: ranked steps, each with a prompt block (evidence, what to do, when it is done).
- `atlas-data.json` holds every fact in machine-readable form (keys: ARC, ARC_LAYERS, ENT, REL, DAT_ROWS, FILES, DEPS, SANKEY_NODES, SANKEY_LINKS, SWIM, HOOK_EVENTS, HOOK_NODE, HOOK_UI, TR, STATES, ROLES, AUTH, PIIREACH, CHAIN, PARITY, PV, TESTCATS, CLASSES, DD, TEST_NOTE, API, PATTERNS, LAYERS, RISKS, KPIS, SECTIONS, FAILED, META, COVERAGE, DOCS, RULES, UITESTS, MEASURED, RUNTIME, NEXT).
