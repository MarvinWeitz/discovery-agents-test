---
product: run
step: The run itself
status: ok
generated: 2026-11-10T15:49Z
---

# Run timeline

_The run itself_ · Which stages ran, in which mode, how long each took and what it reported.



Mode **static** · toolkit 1.0.0 @ 782e4b4 · CAP 9.9.4 · app @capire/sflight @ 7f42e85

![stage timeline](views/timeline.svg)

| Stage | Status | Method | Seconds | Said |
| --- | --- | --- | --- | --- |
| discover | ran | static | 574.8 | @capire/sflight: 261 nodes, 406 edges, 1 slices, coverage 99%, 8 diagrams rendered |
| facts | ran | static | 5.4 | atlas facts written: /home/runner/work/discovery-agents-test/discovery-agents-test/out/sap-samples-cap-sflight-7f42e8577c9bdbc2e51d1844ffc64ff00dd724f1/atlas-data.json (14 sections; ARC generated, DAT generated, DEP generated, FLW generated, STA generated, AUT generated, PAT generated, UIS generated, TST generated, API generated, RSK generated + agent, COV generated, RLS generated (rules library), UIT generated; 15 risks, 32 patterns, 122 classes) |
| findings | ran | static | 0.5 | findings (static): 129 findings (126 static, 3 human), 21 open gaps of 21 → /home/runner/work/discovery-agents-test/discovery-agents-test/out/sap-samples-cap-sflight-7f42e8577c9bdbc2e51d1844ffc64ff00dd724f1/run/findings |
| tests | ran | static | 1.1 | generated 19 tests in 2 files → /home/runner/work/discovery-agents-test/discovery-agents-test/out/sap-samples-cap-sflight-7f42e8577c9bdbc2e51d1844ffc64ff00dd724f1/run/tests/generated (syntax OK) |
| atlas | ran | static | 27.4 | atlas written to /home/runner/work/discovery-agents-test/discovery-agents-test/out/sap-samples-cap-sflight-7f42e8577c9bdbc2e51d1844ffc64ff00dd724f1/atlas: 15 topics, 37 images |
| products | ran | static | 4.7 | 15 step products → /home/runner/work/discovery-agents-test/discovery-agents-test/out/sap-samples-cap-sflight-7f42e8577c9bdbc2e51d1844ffc64ff00dd724f1/steps (12 with results, 3 not run here, 0 failed) |
| ai-requests | off | static |  | mode static |
| validate | ran | static | 0.1 | valid (mode static; 129 findings, 21 gaps, manifest with 7 stages) |
| run-tests | ran | measured |  | startup success, generated tests success |

Blue: static · green: measured (the running app answered) · amber: AI · red: failed.

**Deeper:** [stages.json](data/stages.json)

Read from: `manifest.json` · [all products](../index.md)
