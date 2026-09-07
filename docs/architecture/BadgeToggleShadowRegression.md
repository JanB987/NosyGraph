# Badge Toggle Shadow Regression

## Purpose

This matrix verifies that the new host-neutral badge transition produces the same semantic graph state as the still-live legacy implementation.

The shadow path never mutates the graph. [GraphBadgeToggleShadowService](GraphBadgeToggleShadowService.md) captures state, calculates the new transition, lets legacy code perform the visible operation, and sends both states to [GraphBadgeToggleShadowComparator](GraphBadgeToggleShadowComparator.md).

## Scope

Included:

- Normal link-badge expansion and collapse.
- Outer and embedded graph contexts.
- Existing, missing, shared, duplicate, and nested target nodes.
- Notes, nodes, edges, child badges, and expansion ownership.

Not included yet:

- Parent-semantic badge operations.
- Alt-click link input.
- Ctrl/Cmd-click chain expansion.
- Lens creation, group behavior, physics fidelity, or persistence writes unrelated to a normal toggle.

Those paths still cross application boundaries but use separate legacy operations.

## Preparation

1. Run `npm run typecheck`, `npm test`, and `npm run build`.
2. Reload the NosyGraph plugin in the Test Vault.
3. Open Obsidian Developer Tools and select the Console.
4. Filter for `[NosyGraph architecture shadow]`.
5. Open a graph note with the LinkType used for the test enabled.
6. Clear the console before each scenario.
7. Record the graph note, source note, LinkType, and target notes used.

A successful comparable toggle is silent. Silence is meaningful only when the visible legacy action also occurred as expected.

## Core matrix

| ID | Scenario | Setup and action | Expected visible result | Expected shadow result |
|---|---|---|---|---|
| B01 | Single existing target | Source has one valid relationship; expand, then collapse | One target and one relationship appear, then disappear according to ownership | No shadow warning on either click |
| B02 | Multiple targets | Source has two or more targets; expand, then collapse | Every target appears once in stable graph context | No missing or unexpected node, edge, badge, or note differences |
| B03 | Empty relationship set | Use an enabled LinkType with no relationships and click its badge | Badge follows current empty-expansion behavior without adding targets | No transition rejection or state mismatch |
| B04 | Missing target note | Relationship points to an unresolved Markdown path | Missing node appears with the current missing-note presentation | Note availability is `missing`; no note-state mismatch |
| B05 | Reuse visible node | Target note is already visible and duplicate nodes are disabled | Existing node is reused; no second node appears | Existing origin and badges remain unchanged; ownership is added safely |
| B06 | Duplicate target node | Enable duplicate-node behavior and expand toward an already visible note | A distinct duplicate instance appears | Duplicate node ID, badges, edge, and ownership match |
| B07 | Shared target ownership | Two source badges expand to the same reusable target; collapse one | Shared target remains while still owned or otherwise visible | First collapse removes only unshared ownership and edges |
| B08 | Nested expansion | Expand A to B, then expand a badge on B to C; collapse A | C and its nested expansion collapse with the parent subtree | Child expansion IDs and removal order match |
| B09 | Independently visible edge | Ensure the source-target edge is visible before badge expansion | Expansion reuses the visible relationship; collapse does not incorrectly delete it | Edge keeps `visible` identity/origin rather than `badge-expansion` |
| B10 | Child-node badges | Expand to a new node that has active LinkTypes | The new node exposes the same configured badges as other nodes | Badge IDs, context, semantics, relationship presence, and duplicate behavior match |
| B11 | Note metadata | Target has frontmatter node size and icon settings | Target renders with current configured metadata | Properties, configured size, and icon match the post-legacy snapshot |
| B12 | Embedded graph | Repeat single and nested expansion inside a graph lens | Nodes and badges remain inside the embedded context | Context-scoped node, badge, edge, and expansion identities match |
| B13 | Repeated click | Expand, collapse, and expand the same badge again | Each click produces exactly one state transition | No stale or accumulated ownership differences |
| B14 | Persisted replay | Expand, close/reopen the graph, then collapse the restored expansion | Persisted legacy state restores and remains collapsible | The subsequent user-triggered collapse compares successfully |

## Diagnostic checklist

### `Transition could not be compared`

Record the `reason` field:

- `shadow-threw`: capture the included error and the target note involved.
- `transition-rejected`: inspect the calculation branch and typed failure.
- `expected-state-rejected`: inspect the generated change set and store validation failure.
- `legacy-not-applied`: normally produces no warning and is acceptable only when the requested state was already active.

### `Legacy state disagreed with the calculated transition`

Record every structured difference:

- `collection`: notes, nodes, edges, badges, or expansions.
- `entityId`: stable identity that differed.
- `kind`: missing, unexpected, or value mismatch.
- `fields`: semantic fields that differed when both entities existed.

Do not hide a mismatch by weakening the comparator until the ownership rule is understood. Position, velocity, and radius are already excluded because physics controls them.

## Result record

Use one row per environment/context combination:

| Date | Plugin commit | Scenario | Context | Expand | Collapse | Console | Persistence | Notes |
|---|---|---|---|---|---|---|---|---|
|  |  | B01 | outer | Not run | Not run | Not run | Not run |  |
|  |  | B08 | outer | Not run | Not run | Not run | Not run |  |
|  |  | B12 | embedded | Not run | Not run | Not run | Not run |  |

Use `Pass`, `Fail`, or `Not applicable`. Add rows rather than overwriting earlier evidence.

## Exit criteria

The normal badge slice is ready for live-ownership planning when:

1. B01–B14 have an explicit result or documented reason for being inapplicable.
2. Visible behavior matches the current accepted plugin behavior.
3. Applicable expand and collapse operations produce no shadow warnings.
4. Reloaded legacy state remains usable.
5. Every failure has either been fixed or documented as an intentional semantic difference.


## B1 execution record

Run date: 2026-09-07  
Repository commit: `4c3534e`  
Automated command: `npm.cmd test -- --run` against the badge, expansion, collapse, snapshot, legacy-adapter, and store test files.  
Automated result: **17 test files passed, 85 tests passed**.

The automated result proves host-neutral transition and ownership behavior. It does not prove rendered pixels, pointer hit testing, Obsidian view persistence, or a live shadow warning-free console run. Those columns remain pending until a live Obsidian UI pass is available.

| ID | Semantic and transition evidence | Shadow comparison evidence | Embedded context | Visible behavior | Persisted replay | B1 status |
|---|---|---|---|---|---|---|
| B01 | Pass — normal expand/collapse planning and legacy execution tests | Pass — shadow calculation preserves the live result without mutation | Outer fixture | Blocked — no UI control | Blocked — no live reload | Partial |
| B02 | Pass — ordered multi-target change set and ownership | Pending — no dedicated multi-target shadow fixture | Outer fixture | Blocked | Blocked | Partial |
| B03 | Pass — empty target plans create an empty expansion | Pending — no dedicated empty-target shadow fixture | Outer fixture | Blocked | Not applicable | Partial |
| B04 | Pass — unresolved links remain explicit missing notes | Pending — shadow failure isolation is covered, but not this missing-note fixture | Outer fixture | Blocked | Blocked | Partial |
| B05 | Pass — visible node and semantic edge are reused without replacing origin | Pending — no dedicated reuse shadow fixture | Outer fixture | Blocked | Blocked | Partial |
| B06 | Pass — duplicate-node identity is stable | Pending — no dedicated duplicate shadow fixture | Outer fixture | Blocked | Blocked | Partial |
| B07 | Pass — collapse rehomes a node still owned by another expansion | Pending — no dedicated shared-owner shadow fixture | Outer fixture | Blocked | Blocked | Partial |
| B08 | Pass — nested ownership is recorded and descendant collapse removes the subtree | Pending — no dedicated nested shadow replay fixture | Outer fixture | Blocked | Blocked | Partial |
| B09 | Pass — independently discovered/visible edge identity is preserved on collapse | Pass — comparator tests distinguish semantic edge origin from physics fields | Outer fixture | Blocked | Blocked | Partial |
| B10 | Pass — newly materialized nodes receive configured child badges | Pending — no dedicated child-badge shadow fixture | Outer fixture | Blocked | Blocked | Partial |
| B11 | Partial — detached snapshots retain note properties; no rendered size/icon assertion | Pass — comparator reports note metadata differences independently | Outer fixture | Blocked | Blocked | Partial |
| B12 | Pass — context-scoped badge/node identities and embedded materialization are tested | Pending — no end-to-end embedded shadow toggle | Embedded fixture | Blocked — no UI control | Blocked — no live reload | Partial |
| B13 | Pass — executor refuses to invert an already-applied plan; full click sequence is not replayed | Pending — no repeated-click shadow fixture | Outer fixture | Blocked | Blocked | Partial |
| B14 | Pending — no persistence adapter/reopen test was run | Pending — no persisted shadow replay | Outer and embedded | Blocked | Blocked — requires close/reopen in Obsidian | Blocked |

## Automated evidence used

- [GraphBadgeTogglePlan tests](../../src/graph-application/GraphBadgeTogglePlan.test.ts)
- [GraphBadgeToggleService tests](../../src/graph-application/GraphBadgeToggleService.test.ts)
- [GraphBadgeToggleShadowService tests](../../src/graph-application/GraphBadgeToggleShadowService.test.ts)
- [GraphBadgeToggleShadowComparator tests](../../src/graph-application/GraphBadgeToggleShadowComparator.test.ts)
- [GraphExpansionTargetMaterializer tests](../../src/graph-application/GraphExpansionTargetMaterializer.test.ts)
- [GraphExpansionChangeSet tests](../../src/graph-application/GraphExpansionChangeSet.test.ts)
- [GraphCollapseChangeSet tests](../../src/graph-application/GraphCollapseChangeSet.test.ts)
- [Legacy badge executor tests](../../src/graph-application/LegacyGraphBadgeToggleExecutor.test.ts)
- [Legacy snapshot adapter tests](../../src/graph-application/LegacyGraphSnapshotAdapter.test.ts)
- [GraphStore tests](../../src/graph-application/GraphStore.test.ts)

## B1 completion state

B1 is **partially complete**. All executable host-neutral regression coverage listed above passes. The following evidence is still required before B1 can be closed:

1. Run B01–B14 in the visible Obsidian graph, including outer and embedded contexts.
2. Capture console output showing whether each applicable shadow comparison is warning-free.
3. Close and reopen the graph for B14 and record the persisted replay result.
4. Replace the blocked/pending cells with dated observations and evidence paths.
