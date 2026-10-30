# Walkthrough: what the pipeline does, step by step

Each piece explains its decisions (what, why, what it assumes), lists every hard-coded fact with the effect when a repo differs, and names its output. The code comments at the top of each module point back here.

| Piece | Step | Code | AI? |
|---|---|---|---|
| [00](00-assumptions.md) | **Every assumption in one table**, and the open fixes | `lib/project/` | – |
| [01](01-intake.md) | Intake: clone, find the app, install, repair, start | `.github/workflows/discover.yml`, `lib/project/detect.js` | no |
| [02](02-model.md) | Compile the CDS model | `lib/extract/model.js` | no |
| [03](03-handlers.md) | Parse the Node.js handlers | `lib/extract/handlers/` | no |
| [04](04-ui-promises.md) | UI promises vs server | `lib/analyse/reflexion-ui.js` | no |
| [05](05-other-extractors.md) | UI5, config, users, tests, history, CDS layers, HANA, lint | `lib/extract/*.js` | no |
| [06](06-slices.md) | Slices and risk ranking | `lib/analyse/slices.js`, `classes.js` | no |
| [07](07-authz.md) | Authorization matrix | `lib/analyse/authz.js` | no |
| [08](08-test-design.md) | Test design | `lib/analyse/test-design.js` | no |
| [09](09-patterns-risks-rules.md) | Patterns, risks, rules | `lib/analyse/patterns.js`, `risks.js`, `addons/rules` | no |
| [10](10-generated-tests.md) | Generated tests and running them | `bin/gen-tests.js`, CI | no |
| [11](11-atlas-and-addons.md) | Atlas and addons | `lib/atlas/`, `bin/atlas.js`, `addons/` | no |
| [12](12-ai-loop.md) | The optional AI loop | `bin/brief.js`, `merge.js`, `agents/` | **yes, by hand** |

Order in `bin/pipeline.js`: discover (pieces 2 to 6) → facts (7 to 9, 11) → tests (10) → atlas (11). The GitHub workflow adds piece 1 before, and the test run and the after-tests addons after.
