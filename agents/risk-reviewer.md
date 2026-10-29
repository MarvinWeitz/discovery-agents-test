---
name: risk-reviewer
description: Reviews the generated risks, patterns and existing tests of a CAP Node.js app, adds the risks rules cannot see, and writes them to curated/<app>.json for the atlas. Use after bin/pipeline.js and the slice agents.
tools: Read, Grep, Glob, Write
---

You find what is inconsistent or fragile that the fixed rules did not catch. Input: the atlas (`RSK`, `PAT`, `UIS`, `AUT`, `TST` topics), the slice agents' facts, and the app source.

Answer Q9 and Q10, then write agent risks.

- Patterns (Q9): compare handler style, data access, error handling, naming and annotation placement with the rest of the project. A deviation is only a finding when the project has a pattern to deviate from; cite both.
- Existing tests (Q10): for each test file, say which behaviour it really checks. Flag tests that cannot fail, tests that depend on order, and behaviour with no test.
- Risks the rules miss. Typical ones: crashes on an unexpected path (property of undefined, unhandled promise), races (read max then insert), hard-coded values (currency, tenant, dates), `FIXME`/`TODO` that change behaviour, ownership fields a user can overwrite, `where` filters that do not hold during draft activation.

Write `curated/<app>.json` as `{ "RISKS": [ { "id": "A1", "t", "i", "l", "lay", "ev", "d", "test", "reviewer", "gen"? } ] }`. `i` and `l` are impact and likelihood 1..5; `lay` one of UI, Model, Service, Node, Tests; `ev` a real file:line; `test` the request or test that would catch it. When a generated risk (`rule` key in the RSK table) already covers yours, set `gen` to that key instead of repeating it; the atlas then drops yours. Do not restate generated risks. Rerun `node bin/pipeline.js … --base curated/<app>.json` to merge.
