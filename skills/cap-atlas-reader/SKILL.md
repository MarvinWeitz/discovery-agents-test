---
name: cap-atlas-reader
description: Answer questions about a CAP app, plan changes or write tests from a discovery atlas (atlas/README.md + topics/*.md + atlas-data.json) produced by the cap-discovery-toolkit. Use when an atlas folder is available and the task is to understand or test that app.
---

# Reading a discovery atlas

1. Open `atlas/README.md`. Its front matter names the app, commit and run date; its KPI table and topic table give the overview. Facts may be stale if the app's commit differs from `commit` in `atlas-data.json`.
2. Open only the topic files you need. Each starts with YAML front matter (`topic`, `views`, `facts: generated | generated + agent`).

| Question | Topic |
| --- | --- |
| What runs where, which services and apps | ARC |
| Entities, compositions, personal data | DAT |
| Which CDS file depends on which, layer violations | DEP |
| What a request changes, which handler runs on which event | FLW |
| Status values and allowed transitions | STA |
| Who may do what | AUT |
| Conventions used, and where they break | PAT |
| UI rules the server does not enforce | UIS |
| Ranked risks with the test that catches each | RSK |
| Equivalence classes, all-pairs suite, coverage | TST |
| Endpoints and access | API |

3. Quote evidence as given (`file:line`), and open that line before you change code there.
4. Treat `verify`, `?` and `a` (unclear) as open questions, not facts.
5. For machine use, `atlas-data.json` holds the same facts (keys listed at the end of the README). Ids such as `G3`, `A2`, `UIS:acceptTravel:A` are stable between runs of the same commit.
6. When you write a test, start from `run/tests/generated/*.test.js` and reuse its helpers (`status`, `as`); do not edit generated files.
