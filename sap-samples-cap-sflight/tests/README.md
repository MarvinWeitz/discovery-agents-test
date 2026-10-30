# Generated cds.test suites

Run 2026-10-30T08:06Z, app @capire/sflight, commit 7f42e8577c9bdbc2e51d1844ffc64ff00dd724f1.

| File | Category | Tests |
| --- | --- | --- |
| authorization.test.js | Authorization | 12 |
| ui-vs-server-rules.test.js | UI vs server rules | 7 |

Copy the folder to `test/generated/` in the app and run it with the app's test runner (`npx jest test/generated` or `npx mocha test/generated`).
Paths assume the folder sits two levels below the app root. `today:` tests pin current behaviour and should pass; `it.skip` `spec:` tests describe the intended behaviour and fail until the finding is fixed.
Syntax-checked with `node --check`; not executed by the toolkit.
