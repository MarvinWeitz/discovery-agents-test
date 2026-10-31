---
piece: 4 of 12
title: UI promises vs server enforcement (reflexion)
code: lib/analyse/reflexion-ui.js, lib/project/sources.js (annotation locator)
runs: bin/discover.js, after pieces 2 and 3
---

# Piece 4: UI promises vs server

Goal: for every rule the Fiori UI promises through annotations (this action only in status X, these fields read-only, no Create button), check whether the server enforces the same rule. A rule that only the UI keeps can be bypassed with a plain OData call.

The method is a reflexion model (Murphy and Notkin): the annotations are the intended model, the handlers from piece 3 are the real one, and the step reports where they agree and where they differ.

## Decisions, in run order

### D1. Only service entities are checked
- **What:** only CSN definitions that piece 2 turned into `svcentity:` nodes.
- **Why:** UI annotations describe what an OData service shows. Annotations on database entities are inherited by the projections, and the compiled CSN already carries them there.

### D2. Collect status symbols first
- **What:** a first pass reads every `@Core.OperationAvailable` expression and records enum symbols with their values (`#Open` → `O`).
- **Why:** handlers compare against values (`'O'`) or constants (`TravelStatusCode.Open`). With the symbol table, both sides can be compared.
- **Domain:** the set of all values collected this way is the "state domain" used for every action. This assumes **one status field per app**. An app with two state machines (for example, travel status and payment status) gets both value sets merged into one domain.

### D3. Actions offered under a condition (`@Core.OperationAvailable`)
- **UI side:** only an expression of the form `<path> = | != | <> <value or #symbol>` is understood. The path drops `$self`, `code` and `in` (`$self.TravelStatus.code != #Canceled` → field `TravelStatus`, `!=`, `X`). Anything else (`and`, `or`, function calls, `true`/`false`, a plain path) gives a rule with verdict `ui-only` and no state comparison.
- **Server side:** handlers that handle the bound action (by edge or by event name), and the rules they enforce (piece 3).
- **Matching a server rule to the field:** comparisons `<lhs> == | === | != | !== | = <value>` in the rule's guard, where the left side contains the field's last segment (without `_code`), or contains `status` when the field ends with `status`. Constants such as `TravelStatusCode.Accepted` are mapped through the symbol table.
- **Verdict:** compare the states the UI allows with the states the server allows. A rejection forbids the states where its guard holds. A conditional write allows only the states where it holds.
  - `enforced`: same set
  - `partial`: the server allows more
  - `stricter`: the server allows less
  - `ui-only`: no server rule touches the field
- **Effect:** the value the handler writes into the field (`UPDATE ... .with({ TravelStatus_code: ... })`) is recorded, and becomes the target state in the state machine (pieces 8 and 11).

### D4. Field control (`@Common.FieldControl`)
- **What:** elements are grouped by their FieldControl path. A rule is `enforced` when an UPDATE, PATCH, EDIT or SAVE handler on the entity has a rule whose guard mentions the path's root.
- **Path root:** the first segment of the path that is not `to_Travel`. **This name is left over from cap-sflight**, where FieldControl paths go through `to_Travel` from Booking to Travel. Other apps' navigation names are not skipped, so their root is the navigation property itself. See the open fixes in [00-assumptions.md](00-assumptions.md).
- **Weak:** "mentions" is a case-insensitive text match, so it is generous.

### D5. Create and Delete hidden (`@UI.CreateHidden`, `@UI.DeleteHidden`)
- `enforced` when a `before` CREATE or NEW (or DELETE) handler on the entity has a rejection. Any rejection counts; whether it checks the same condition is not tested.

### D6. Side effects (`@Common.SideEffects`)
- **What:** each qualifier's source properties or entities, and target properties.
- `consistent` when an `on` CRUD handler writes this entity and either has no field list, or its field list includes a source, or a source is a navigation (`to_...`). Otherwise `ui-only`: the UI re-reads fields that nothing on the server recomputes.

### D7. What CAP enforces by itself
- `@readonly`, `@mandatory` and `@assert.range` on elements (or on their type), and `@assert.range` on action parameters, get verdict `framework`. CAP's generic handlers check these.
- Skipped on `@readonly` and `@cds.autoexpose` entities, where they promise nothing. Managed fields (`createdAt`, `createdBy`, `modifiedAt`, `modifiedBy`) and draft fields (`IsActiveEntity`, `HasActiveEntity`, `HasDraftEntity`, `Draft*`, `LastChanged*`) are skipped.

### D8. Evidence for the UI side
- The CSN does not give the line of an annotation. `lib/project/sources.js` searches the CDS files of the app, srv and db folders (in that order) for the annotation name. When a second word is given (the action or element name), that word must appear in the 4 lines above or the line below.
- **Weak:** the first textual match wins, so with several similar annotations the line can point at the wrong one.

## Every hard-coded fact in this piece

| Value | Where | Effect if your repo differs |
|---|---|---|
| annotations read: `@Core.OperationAvailable`, `@Common.FieldControl`, `@UI.CreateHidden`, `@UI.DeleteHidden`, `@Common.SideEffects`, `@readonly`, `@mandatory`, `@assert.range` | reflexion-ui.js | other UI rules (`@UI.Hidden`, `@Capabilities.*Restrictions`, `@UI.UpdateHidden`) are not checked |
| OperationAvailable form `<path> =/!=/<> <value>` | `uiCond` | compound conditions get `ui-only` without a state check |
| path parts dropped: `$self`, `code`, `in` | `uiCond` | – |
| one state domain per app | D2 | two status fields are merged |
| `status` heuristic on the guard's left side | `serverConds` | guards on differently named variables are not matched |
| FieldControl root skips `to_Travel` | D4 | **cap-sflight leftover** |
| update events `UPDATE PATCH EDIT SAVE` | D4 | – |
| managed and draft field names skipped | `MANAGED`, D7 | – |
| annotation search order app → srv → db, window 4 lines up, 1 down | lib/project/sources.js | wrong line on look-alike annotations |

## Output
`UiRule` nodes with kind (`operation-available`, `field-control`, `CreateHidden`, `DeleteHidden`, `side-effects`, `readonly`, `mandatory`, `assert.range`), the UI condition, the server finding, the verdict, and for actions the state domain, the UI-allowed states, the server-allowed states and the effect. Edges `checked_in` and `enforced_by` link to the handlers and rules. `confidence` is `medium` for `ui-only` (absence of evidence) and `high` otherwise.
