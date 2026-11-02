# Stress corpus: do the static checks find what they should?

We plant known bugs in small, valid CAP apps and check that the toolkit reports each one, and nothing else. Every case is first proved valid and every bug is proved real, so a miss is a real miss and an alarm on a clean app is a real false alarm.

**Results:** [report/SCORECARD.md](report/SCORECARD.md) (per check, per seed, before/after) · [report/PILOTS.md](report/PILOTS.md) (real apps: determinism, mutation, alarm changes) · [ai/AI-PASS.md](ai/AI-PASS.md) (AI pass on known answers)

![scorecard](report/scorecard.svg)

## Headline (2026-11-02)

| Measure | Result |
| --- | --- |
| Seeded bugs found | 48 of 48 reachable (2 more are out of reach by design, see Limits) |
| Bug-free variants understood (odd code shapes, config layouts, probes) | 19 of 19, no new alarm |
| False alarms on the 2 clean control apps | 0 |
| Cases proved valid (compile, tests, tsc, UI5 lint + build) | 72 of 72 |
| Bugs proved real (proof test passes on the seeded app, fails on the clean one) | 26 of 26 |
| Before this round, same seeds on `main` | 24 of 67 clean results (67 of 67 now) (see SCORECARD "Before and after") |
| Held-out round (written after the fixes, scored once before more fixes) | 11 of 15 reachable on the first run |
| AI pass on 12 known-answer gaps | 12 of 12 right |

## Method

```
stress/apps/<base>     a valid app (CAP JS + Fiori elements "orders", CAP TypeScript + freestyle UI5 "shop")
stress/seeds/*.js      seeds: edits on a base + what must be found (expect), may be found (also), must not (forbid)
        │ materialize (every edit must apply exactly once)
        ▼
  validate ─► cds compile · node --test (cds.test, SQLite) · tsc · ui5lint · ui5 build
        │     bug seeds: the proof test must pass here and FAIL on the clean base
        │     bug-free seeds: the base app's own tests + the proof must all pass
        ▼
  discover (bin/discover.js → atlas-facts → findings, the same as the pipeline, static mode)
        ▼
  score ─► diff against the clean base: hits, misses, noise (new alarms not expected), forbidden, lost
```

- **Seeds** come in four groups: `orders` (authz, actions, UI promises, SQL, events, layering), `shapes` (loops, `require`d handlers, bound methods, `cds.service.impl`, `srv =>`, `@impl`, `srv/src`, ESM, CDS-expression annotations), `config` (`.cdsrc.json`/`.yaml`, profiles, `cds.folders`, monorepo, xs-security, MTX sidecar, `ui5.yaml` paths, dummy/mocked auth in production, remote services) and `held-out` (TS + freestyle UI5, written after the first fixes).
- **Probes** are claims that something is *not* a bug (static `@Common.FieldControl` is enforced by CAP, `WRITE` does not grant bound actions). Their proof test shows CAP's behaviour, and the scorer forbids the alarm.
- **Alarms** are findings with severity warning/critical or of an alarm kind. Pattern notes, the authorization matrix and "framework/consistent" UI verdicts are advisory and never counted as false alarms.

## Commands

```bash
cd stress && npm ci && cd ..                     # corpus tools (dev only, see THIRD-PARTY-LICENSES.md)
node stress/bin/stress.js run [filter] --jobs 4  # all seeds, or those whose id/base/group contains filter
node stress/bin/stress.js run --strict           # CI: fail on any regression against report/baseline.json
node stress/bin/stress.js baseline               # accept the current results as the new baseline
node stress/bin/pilots.js <clones-dir> --base-toolkit <main checkout>   # real pilots (needs the six clones, npm installed)
```

CI: `.github/workflows/stress.yml` runs the corpus with `--strict` on every PR that touches the toolkit or the corpus.

## What changed because of it

Round 1 found 25 of 51 seeds. The misses led to these fixes (each one re-scored):

- **New draft rules** (`addons/rules/library`): `unknown-role`, `unknown-grant`, `orphan-handler`, `unknown-event`, `event-never-emitted`, `sql-injection` (TS AST taint), `auth-not-for-production` (reads the production `cds.env`), `ui5-unknown-binding`.
- **Parser:** handlers passed as expressions, `this.x` / `.bind(this)` methods, loop registrations over literal tables, helper calls with literal arguments bound to parameters, emits on other services and with computed names.
- **UI promises:** flattened `$edmJson` annotations, enum domains, new verdicts `dynamic`, `unknown`, `unimplemented`; static FieldControl is reported as framework-enforced; annotation evidence points at the right action.
- **Authz:** `WRITE` no longer counts as granting bound actions; `@requires`/`@restrict` on actions become graph edges; pseudo roles handled.
- **Tests and risks:** `.mjs/.cjs` tests, users from `.auth()` and helper variables; an event counts as tested only when a test emits it.
- **Rules engine:** `srv/src` scanned, `.cjs/.mjs` included, `??` in max+1 ids, currency literal regex.

## Held-out round

The 16 `shop` seeds were written after round 1's fixes and scored once before any change: 11 of 15 reachable found, 0 false alarms. Misses: a role typo on an action (`@requires` on actions was not in the graph), and three UI5 binding typos (no check existed). All four are found now; `ts-stock-unchecked` stays out of reach.

## Real pilots

`bin/pilots.js` runs the six pilots twice (findings must be identical), applies up to N mutants per operator (drop `@requires`, drop a `where`, delete a guard, flip a comparison, rename a handler event, rename an emitted event, drop `@readonly`/`@mandatory`/`@assert`) and checks that each changes a finding, and compares alarms with the `main` toolkit. Results and the surviving mutants: [report/PILOTS.md](report/PILOTS.md).

Last run (2026-11-02): all six pilots give identical findings twice; 26 of 28 mutants change a finding. Only `drop-requires` and `rename-handler` mutants usually raise an *alarm*; a deleted guard or a dropped `where` shows up as a changed rule or matrix cell, not as a warning, because nothing says the guard was meant to be there. New alarms against `main`: one true positive (event app: mocked auth at the top level, nothing overrides it for production). Three bookstore alarms from the new rules were false (an event of a reused package, a relative dataSource uri, an event counted as tested because a test names `Books`) and were fixed before this run; three old bookstore alarms are gone because static `#Mandatory` is enforced by CAP.

Survivors judged:

- `sflight` flip in `deductDiscount`/accept guard: the guard only changes which error message is shown; the `where` clause of the update enforces the rule. No behaviour a static check should report.
- `sflight` dropping `@readonly` on `@cds.autoexpose` master data: auto-exposed entities are read-only anyway. No effect.

## Limits

- Two bugs are out of reach by design and stay in the corpus as markers: `transition-wrong-target` (reject sets "approved": nothing says what reject should mean) and `ts-stock-unchecked` (a missing business check no annotation states).
- The corpus is small and written by the same author as the fixes. The held-out round and the real-pilot mutation runs are the checks against over-fitting; more held-out bases would help most.
- Static mode only; the measured (runtime) layer is covered by the pilots' CI, not here.
