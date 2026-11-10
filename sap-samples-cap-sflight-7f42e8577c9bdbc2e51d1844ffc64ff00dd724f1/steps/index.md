# Step products

@capire/sflight @ 7f42e85 · mode static · 2026-11-10T15:00Z

Each step of the run publishes its own product: `summary.json` (numbers), `README.md` (card with pictures), explorers (`*.html`) and `data/` (standard formats). Read a card, then drill down.

## How the run went

| Product | Step | Status | Numbers |
| --- | --- | --- | --- |
| [Run timeline](run/README.md) | The run itself | results | 8 stages ran · 0 failed · 315 seconds · static mode |
| [Project passport](project/README.md) | Probe and intake | results | 2 services · 14 model files · 5 plugins · 1 without own code |
| [Evidence ledger](findings/README.md) | Findings and gaps | needs a look | 142 findings · 13 measured · 0 AI (gated) · 19 open questions |
| [AI ledger](ai/README.md) | AI gap pass | not run here | 19 AI could answer |

## What the app is

| Product | Step | Status | Numbers |
| --- | --- | --- | --- |
| [Model map](model/README.md) | cds compile (CSN) | results | 13 entities · 29 service entities · 6 compositions · 53 things depend on Travel |
| [API surface](api/README.md) | EDMX, OpenAPI, AsyncAPI | results | 2 services · 23 entity sets · 137 OpenAPI paths · 20 open without role |
| [Behaviour matrix](behaviour/README.md) | Handler AST | results | 13 handlers · 11 rules · 6 rejections · 2 helpers |
| [Screen map](screens/README.md) | UI5 and Fiori annotations | needs a look | 2 apps · 5 pages · 21 UI promises · 7 UI only |
| [Access map](access/README.md) | Authorization | needs a look | 13 operations · 6 users · 4 open without role · 0 measured cells differ |

## Where it is fragile

| Product | Step | Status | Numbers |
| --- | --- | --- | --- |
| [Code findings](checks/README.md) | Lint, Opengrep, rules | problems | 71 findings · 21 files · 4 critical · 32 warnings |
| [Hotspots and change coupling](history/README.md) | Git history | results | 1238 commits · 113 files changed · 83 hottest: package.json · 39 coupled pairs |

## How well it is tested

| Product | Step | Status | Numbers |
| --- | --- | --- | --- |
| [Classification tree](testdesign/README.md) | Test design | results | 122 classes · 7 categories · 12 covered today · 19 pairwise rows |
| [Test results](tests/README.md) | Generated tests and test run | results | 12 passed · 0 failed · 7 skipped · 110 requests recorded |
| [Coverage by class](coverage/README.md) | Coverage | needs a look | 13% classes tested · 58 untested · 0 failing · 9/11 rules reached |
| [Test strength](mutation/README.md) | Mutation testing | not run here | nightly score |

## Ask across products

```sh
node bin/query.js <out> impact <Entity|ServiceEntity|file:line> [--depth 3] [--assoc]
node bin/query.js <out> who-can "<operation text>"
node bin/query.js <out> tests-for <file[:line]>
```
