---
piece: 3 of 12
title: Parse the Node.js handlers
code: lib/extract/handlers/ (index, binding, names, registrations, body, file-scan, vocabulary), regex.js (old text matcher, only with --regex)
runs: bin/discover.js, right after piece 2
---

# Piece 3: Parse the handlers

Goal: find every CAP event handler in the app's JavaScript or TypeScript, which service and entity it belongs to, and what it does: the rules it enforces, what it reads and writes, which events it emits and which other services it calls.

The parser is the TypeScript compiler API. It reads `.js` and `.ts` as a syntax tree and runs no code. All facts get `confidence: high`, because they come from the tree, not from text matching.

## Decisions, in run order

### D1. Which files (`binding.js` `handlerFiles`)
- **What:** every `.js` or `.ts` file (not `.d.ts`) under the srv folder (name from `cds.env.folders`, default `srv/`), plus the implementation CAP itself resolves for each service (probe `impls`: `@impl`, `<name>.js|ts` next to the `.cds` file or in its `lib/` or `handlers/` folder, `cds.requires.<service>.impl`), plus `server.js`, plus service implementations **outside** the app folder that a service's `@impl` or its `.cds` file location points to (reuse packages next to the app in a monorepo, for example `../reviews/srv/reviews-service.js`).
- **Assumes:** handlers live in the srv folder. **Missed:** handler code in plugins (`cds-plugin.js`), or compiled output only (a TypeScript app whose sources are elsewhere).

### D2. Which service a file implements (`binding.js` `serviceFor`)
Tried in this order. The first hit wins:
1. A class that `extends cds.Service` or `cds.ApplicationService` and whose name equals the last part of a service name (`class TravelService` → `sap.fe.cap.travel.TravelService`).
2. `@impl` on the service, resolved three ways: against the folder of the `.cds` file (what CAP does), against the project root, and against the file's parent folder (older apps).
3. CAP's convention: a file with the same path as the service's `.cds` file, `.js` instead of `.cds`, and no `@impl`.
4. The same base name as the `.cds` file that defines the service, anywhere.
- **Then:** split implementations. When a bound file calls a function it got from a local `require`/`import` and passes `this`, `srv` or `service`, the target file gets the same service. This is followed for up to 6 rounds (Poetry Slam: `await poetrySlamsHandler(this)`).
- **Unbound files** are still parsed. Their handlers get `service: null` unless the receiver says otherwise (D4).

### D3. Names in a file (`names.js`)
- **String constants:** `const X = '...'` and class properties `static X = '...'` (as `X`, `this.X` and `Class.X`). They let `cds.connect.to(SERVICE_NAME)` resolve.
- **Connected services:** a variable set from `cds.connect.to('Name')` (with or without `await`) or `cds.services.Name` / `cds.services['Name']`. Each `cds.connect.to` call also adds a `connects_to` edge from the file, except to `db`. The target is the app's own service if one has that name, otherwise `remote:<name>`.
- **Receiver of a registration:** `this` is the file's service. A function parameter is the file's service, unless the function is passed to `X.prepend(srv => ...)`, which means X's service. A variable from D3's connected services means that service.
- **Entity aliases:** destructuring from `<x>.entities` (`const { Travel } = this.entities`), from `cds.entities('namespace')` (database entities), and named imports from `#cds-models/...` (cds-typer). Action aliases: destructuring from `<Entity>.actions`.
- **Local functions:** `function f()` and `const f = () => ...`, so a handler that calls a helper can be followed (D6).
- **Entity resolution:** an expression resolves to `svcentity:<service>.<name>` (after removing `.drafts` and any `/path`), or for database aliases to `entity:<namespace>.<name>`, or to the one database entity whose name ends with it. Anything else resolves to nothing, and the read or write is dropped.

### D4. Registrations (`registrations.js`)
- **What counts:** a call `<receiver>.before|on|after(...)` whose last argument is a function, or the name of a local function. The receivers `cds`, `app`, `process`, `module` and `emitter` are skipped (lifecycle and Node events, not service handlers).
- **Arguments:** the first argument is the event or a list of events. The optional second is the target entity or a list. A target ending in `.drafts` marks a draft handler.
- **CRUD or not:** events in `CREATE READ UPDATE DELETE NEW EDIT SAVE CANCEL PATCH UPSERT *` are CRUD. A CRUD handler with no target `handles` the whole service.
- **Non-CRUD events** are matched in this order: the bound action through an action alias, an unbound action of the service, a declared event of the service, any action of the service whose name ends with the event. When the receiver is **another** service and nothing matches, the event is taken as a subscription to that service's event (`subscribes` edge). Events starting with `$` and `*` are not subscriptions.
- **Handler node** `handler:<file>:<line>` with phase, events, target(s), service, `registeredFrom` when it is registered from another service's file, async, and the field list when the function body ends with `[ 'a', 'b' ]))` (a SideEffects-style field list).
- **Delegation:** an `on` handler that calls its `next` parameter gets `delegates: true`.
- **Assumes:** the first parameter of the handler is the request (`req` if unnamed), the second is `next`. **Missed:** registrations built in loops (`for (const e of events) this.on(e, ...)`) when the event is not a literal, `srv.on` inside functions that are never called from a registration, handlers in other modules passed as a property (`this.on('X', handlers.x)`), and the CAP 8+ class method style (`async onX(req)` methods without `this.on`).

### D5. What a handler body does (`body.js`)
| Found | Becomes | Details |
|---|---|---|
| `req.reject(...)`, `req.error(...)`, tagged `` req.reject`...` `` | `Rule` kind `rejection` | HTTP status from a numeric first argument, message from the first string, target from a string like `in/x` or a plain name, guard = every enclosing `if`, `else`, ternary and `&&` up to the handler |
| `req.warn`, `req.info` | `Rule` kind `message` | same fields |
| `req.data.x = ...` | `Rule` kind `derivation` | field, expression, guard |
| CQL `SELECT/INSERT/UPSERT/UPDATE/DELETE` chains | `reads` / `writes` edge | target from `.from/.into/.entity` or the first argument, `where`/`and` (template or fluent), values from `.with/.set/.data/.entries`; `req.subject`/`req.target` means the handler's target |
| a write with a `where` that compares something | extra `Rule` kind `conditional-write` | only if the where has `!= <> > < = null` and is not just a key (`{...}`, `UUID =`, a single word) |
| `cds.run(`UPDATE ${X} ...`)` | `reads`/`writes` per interpolated entity | the first entity is the write target for non-SELECT |
| `x.emit('E')`, `x.send('E')` on the own service | `emits` edge | to the declared event of the service if there is one |
| `<connected>.read/create/insert/upsert/update/delete/run/send/emit/get/post/put/patch(...)` | `calls_service` edge, or `reads`/`writes` when the service is `db` | entity from the first argument |
| `*.run('<SQL>')` | `nativeSql` on the handler | SQL = starts with a SQL keyword; flagged HANA-only by keywords (CALL, NEXTVAL, DUMMY, SYS., SQLSCRIPT, DO BEGIN, ADD_DAYS, CURRENT_UTCTIMESTAMP, SERIES_GENERATE, TO_NVARCHAR, CONTAINS) |
| a call to a local function | `Helper` node + `calls` edge, and its body is analysed with its first parameter as `req` | each helper once per handler; functions imported from other files are **not** followed |

### D6. The whole file (`file-scan.js`)
Independent of handlers, for connectors and helper modules:
- calls on connected services (same method list as D5) give a `calls_service` edge from the file,
- native SQL in `x.run(...)` and `cds.run(...)` gives `nativeSql` on the file node,
- `switch (<...kind...>) { case 'hana': ... }` and `if (<...kind...> === 'sqlite')` give `dbBranches` (database kinds `hana`, `sqlite`, `postgres`, `h2` in a switch; `hana`, `sqlite`, `postgres` in a comparison).

### D7. Checked against the running app (addon `runtime`)
Everything above reads code. In CI the addon `runtime` also starts the app with `cds.test` and records what CAP really registers:
- `addons/runtime/record.js` wraps `EventHandlers.prototype.register` in the app's own `@sap/cds/lib/srv/srv-handlers.js`, the one function every `srv.before/on/after/reject` goes through, and notes the file and line of the caller from the stack. CAP's generic handlers (caller inside `@sap/cds`) are skipped; callers in other packages are listed as plugins.
- It writes `run/runtime.json`: registrations, and every served service with its real path.
- `addons/runtime/index.js` matches each registration to a parsed handler by file, phase and line (±2 lines). ✅ found by both, ❗ registered but the parser missed it, ⚠️ parsed but not registered at startup (conditional, registered later, or dead code). Service paths are compared with piece 2 the same way.
- Output: section RTM in the atlas, topic `16-rtm-runtime-check.md`, and `pr/runtime.md` in the PR comment.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| handler files = srv folder + CAP's implementation per service + `server.js` (+ `@impl` outside) | layout.js `handlerDirs`, lib/project/cap.js, binding.js | plugin code is missed |
| a file's service: CAP's answer first, then class name, `@impl`, sibling, base name | binding.js `serviceFor` | – |
| service binding order (class name, @impl ×3, sibling .cds, base name) | binding.js `serviceFor` | a file bound to the wrong service attaches its handlers there |
| split implementation: callee gets `this`/`srv`/`service`, up to 6 hops | binding.js `bindServices` | other parameter names are not followed |
| CRUD events list | vocabulary.js `CRUD` | – |
| CQL verbs `SELECT INSERT UPSERT UPDATE DELETE` | vocabulary.js `QL` | `CREATE`/`DROP` not seen as CQL |
| phases `before on after` | vocabulary.js `PHASES` | `prepend`, `reject` registrations not seen |
| not-a-service receivers `cds app process module emitter` | vocabulary.js `NOT_SERVICES` | a service variable named `app` would be skipped |
| request parameter `req`, next parameter `next` when unnamed | registrations.js | – |
| remote call methods list | vocabulary.js `REMOTE_CALLS` | `srv.tx(...).run` chains are not seen |
| SQL start and HANA-only keyword lists | vocabulary.js `SQL_START`, `HANA_ONLY` | other HANA-only syntax is not flagged |
| database kinds `hana sqlite postgres h2` | vocabulary.js `DB_KINDS*` | – |
| entity aliases from `.entities`, `cds.entities(ns)`, `#cds-models/` | names.js | other import styles (`require('#cds-models/...')`, `cds.entities` without destructuring) are not resolved |
| helpers followed only inside the same file | body.js | logic in imported modules is invisible to rule detection |

## Output
Graph nodes `SourceFile`, `Handler`, `Rule` (rejection, message, derivation, conditional-write), `Helper`, `Event` (emitted or subscribed), `ExternalService`, and edges `implemented_in`, `imports`, `connects_to`, `handles`, `subscribes`, `enforces`, `calls`, `reads`, `writes`, `emits`, `calls_service`. A result object with counts (files, handlers, helpers, rules, subscriptions, remote calls, native SQL, parser version) goes into `metrics.json`.
