# AI pass accuracy on known answers

Run on 2026-11-02. Twelve open gaps from five corpus cases whose true answer is known because we planted it. Each case was copied to a folder outside the repository (the seed files that state the answer were out of reach), the requests were generated with `node bin/ai-pass.js plan`, and one agent per case answered them with the `gap-resolver` instructions (`agents/gap-resolver.md`) and no other hint. Answers were gated with `ai-pass.js check` and graded by hand against the truth. The answers are in [answers/](answers/).

| Case | Gap | Question (short) | Truth (planted) | AI answer | Right | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| shape-handler-modules | enforcement-elsewhere …dfe7 | Is "status = S" enforced for approve? | yes, in `srv/handlers/transition.js` (handlers passed as `require(...)`) | yes, transition.js:5 via approve.js | ✅ | pass |
| shape-handler-modules | enforcement-elsewhere …b9a3 | … "status = O" for submit? | yes | yes | ✅ | pass |
| shape-handler-modules | enforcement-elsewhere …1664 | … "status = S" for reject? | yes | yes | ✅ | pass |
| shape-loop-guard-removed | enforcement-elsewhere …dfe7 | … for approve? | **no**: its table row has `from = null`, so the guard is skipped | no, `['approve', null, 'A']` skips the guard | ✅ | pass |
| shape-loop-guard-removed | enforcement-elsewhere …b9a3 | … for submit? | yes | yes | ✅ | pass |
| shape-loop-guard-removed | enforcement-elsewhere …1664 | … for reject? | yes | yes | ✅ | pass |
| ui-only-action-guard | enforcement-elsewhere …dfe7 | … for approve? | **no** (guard deleted) | no; handler only checks existence | ✅ | pass |
| action-handler-removed | handler-missing | Where is reject implemented? | nowhere: 501 | nowhere, no plugin dependency, expects 501 | ✅ | pass |
| action-handler-removed | authz-unclear …602e | May carol call reject? | authorised (Approver grant), then 501 | authorised, then 501 | ✅ | pass |
| sql-injection-native | native-sql-effect | What does the SQL read and write? | reads `sales_Customers` ID, name with LIKE on the input; writes nothing | same, and notes the injection can read more | ✅ | pass |
| sql-injection-native | rule-confirmation | Is the draft rule sql-injection right? | yes | yes, true positive, fix with CQL | ✅ | pass |
| sql-injection-native | authz-unclear …0f6b | May alice, bob READ Orders? | yes, own rows only (`createdBy = $user`) | yes, own rows only | ✅ | pass |

**12 of 12 right, 0 wrong, 0 "unknown".** One answer was rejected once by the gate (a quote shorter than 8 characters) and passed after the agent's one retry. Every agent kept to "suspected, needs a measured request" and named that request.

## What the AI pass found that we did not plant

The agent on `shape-handler-modules` noticed that the app's own test expects an `OrderApproved` event that the refactored handler no longer emits. The shape was meant to be bug-free; it was not. Two fixes came from this:

1. **Harness:** a bug-free variant now runs the base app's own tests next to its proof (`validate(..., { all: true })`), so "same behaviour" is checked by the full suite, not only by one proof test. The shapes were repaired to emit the event (7 tests each now).
2. **Static check:** new draft rule `event-never-emitted` (declared event of a local service that no handler emits; quiet when a handler emits a computed name or is passed by reference). New seed `event-emit-removed` proves it.

## Limits

Twelve gaps from one small domain; the agents are strong on these because the code is short and local. Real apps have longer paths through helpers and plugins. The grading is by hand, against the planted truth.
