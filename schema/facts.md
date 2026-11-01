# Agent fact format (slice pass)

Formats of the machine-readable layer: `finding.schema.json`, `gap.schema.json` (run/findings/), `ai-answer.schema.json` (answers of the gap pass), `manifest.schema.json` (what ran). This file covers the slice pass of piece 12.

Every Phase 3 agent returns one JSON file. Nothing an agent says enters the graph unless it passes `bin/merge.js`, which checks that each `evidence` points at a real file and line and that `quote` appears within two lines of it.

```json
{
  "agent": "behaviour-analyst",
  "slice": "S01",
  "facts": [ ... ]
}
```

| `kind` | Required fields | Meaning |
| --- | --- | --- |
| `node` | `id`, `type`, `props`, `evidence`, `quote` | A new graph node, or props added to an existing one (same `id`) |
| `edge` | `from`, `rel`, `to`, `props`, `evidence`, `quote` | A relationship; both ends must exist in the graph or in the same file |
| `answer` | `question`, `answer`, `evidence[]`, `quotes[]` or `status: "unknown"` | Answer to one checklist question |
| `classes` | `on`, `technique`, `classes[]`, `evidence`, `quote` | Equivalence classes; each class has `name`, `kind` (`valid`/`invalid`/`boundary`), `input`, `expected` |
| `risk` | `title`, `severity` (`high`/`medium`/`low`), `description`, `evidence`, `quote` | A risk or a pattern violation |

Common optional fields: `confidence` (`high`/`medium`/`low`, default `medium`), `note`.

`evidence` is `path:line` relative to the app root. `quote` is a short verbatim snippet (at least 8 characters) from that line or the two lines around it.

## Checklist questions (same for every slice)

| Id | Question | Answered by |
| --- | --- | --- |
| Q1 | Entry points: which UI routes, OData operations and actions reach this slice? | flow-tracer |
| Q2 | Path: for each entry point, which handlers run in which phase, and what is read or written? | flow-tracer |
| Q3 | Authorization: who may do what, and where is it enforced? | behaviour-analyst |
| Q4 | Rules: every rejection, derivation, default and assertion, stated in business terms | behaviour-analyst |
| Q5 | States: lifecycle and state transitions (status codes, drafts), and which are allowed | behaviour-analyst |
| Q6 | Events and integrations: events emitted or consumed, remote calls, failure handling | event-integration-analyst |
| Q7 | Errors: which errors reach the caller, with which status and message | behaviour-analyst |
| Q8 | Dependencies: which other slices share entities, handlers or files | flow-tracer |
| Q9 | Patterns: where does the slice deviate from the project's own patterns? | risk-reviewer |
| Q10 | Existing tests: what do they cover, and where are they weak? | risk-reviewer |
