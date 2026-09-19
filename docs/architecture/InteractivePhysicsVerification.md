# Interactive Physics Verification

A9 is the live Obsidian verification pass for the staged physics migration. This matrix covers the host behaviors that static parity tests cannot establish: container ancestry, pointer interaction, expansion lifecycle, and settling in a rendered graph.

## Preconditions

1. Open the target vault in Obsidian with the current plugin build loaded.
2. Record the plugin commit, vault name, graph-view mode, and active LinkType configuration.
3. Use a graph fixture that contains:
   - a normal parent expansion;
   - an embedded graph or lens;
   - at least one nested container;
   - enough nodes and edges to observe repulsion, springs, gravity, and confinement.
4. Begin each scenario from a saved, reproducible graph state. Capture a screenshot or short screen recording for any failure.

The matrix uses these result values:

- **Pass** — observed behavior matches the expected result.
- **Fail** — behavior differs; record the smallest reproducible fixture and console error.
- **Blocked** — the scenario could not be exercised in the current session.

## Verification matrix

| ID | Scenario | Expected result | Result | Evidence / notes |
|---|---|---|---|---|
| P01 | Parent container | Expanded children remain inside the parent’s evolving bounds. Moving the parent translates its members, and members do not receive force from unrelated containers. | Blocked | Requires live graph interaction. |
| P02 | Embedded container | An embedded graph/lens keeps its internal layout while its outer bounds and gravity are applied. Closing and reopening preserves the embedded state. | Blocked | Requires an embedded graph fixture. |
| P03 | Nested layouts | Moving or resizing an outer container preserves inner membership and ancestry. Inner nodes remain confined to the correct level without cross-boundary force bleed. | Blocked | Exercise at least two nesting levels. |
| I01 | Drag an ordinary node | The dragged node follows the pointer, neighboring nodes react, and releasing the pointer returns the graph to normal simulation. | Blocked | Check both a free and constrained node. |
| I02 | Drag a container or lens owner | The container and its owned members move together. Releasing the pointer leaves the graph in a stable layout. | Blocked | Include an embedded owner. |
| I03 | Pin and reposition | A pinned node stays at its pinned position while the rest of the graph settles. Dragging it changes the persisted position only when the UI exposes that operation. | Blocked | Reopen the graph to verify persistence. |
| I04 | Unpin | Unpinning removes the persisted position constraint and allows the node to respond to forces on the next step. | Blocked | Verify after a settle and after reopen. |
| I05 | Freeze and resume | A frozen node or graph stops moving while frozen. Releasing the freeze or changing topology wakes simulation and motion resumes. | Blocked | Check the normal freeze gesture and any modifier gesture. |
| E01 | Expand a normal badge | The expected nodes, edges, and badges appear in the owning context. New members start inside the correct container bounds and settle without a jump outside. | Blocked | Record the badge and target note. |
| E02 | Expand an embedded badge | Expansion occurs inside the embedded/lens container, retains ancestry, and does not leak nodes into the parent layout. | Blocked | Include a nested embedded target. |
| E03 | Collapse a parent expansion | Descendants and their owned edges/containers are removed, while shared targets remain when another expansion still owns them. | Blocked | Reopen or refresh to verify the resulting graph. |
| E04 | Collapse an embedded expansion | The embedded subtree disappears from the embedded context and the parent graph remains intact. | Blocked | Check that unrelated nodes do not move unexpectedly. |
| S01 | Settle from a disturbed state | After drag or expansion, motion decays and the graph reaches a visually stable state. Idle frames do not continue visibly oscillating. | Blocked | Record approximate time to settle. |
| S02 | Reheat after interaction | A drag, pin change, expansion, or collapse wakes the simulation and the graph settles again under the same constraints. | Blocked | Compare with S01. |
| S03 | Bounds and origin history | During settling, moving container bounds carry their members consistently; no one-step jump occurs when the origin changes. | Blocked | Best observed with an asymmetric container. |

## Evidence to record

For every run, record:

- date and Obsidian/plugin version;
- the fixture note IDs and LinkType settings;
- the matrix ID;
- result and a short observation;
- screenshot or recording path for failures;
- any console error and the first stack frame;
- whether the result was reproduced after closing and reopening the view.

## Current execution status

The repository has automated evidence for the host-neutral and legacy comparisons:

- [Legacy solver parity audit](LegacySolverParityAudit.md) covers constraints, dragging, pins, freezes, directional links, lenses, and force eligibility.
- [Non-zero-step parity](GraphPhysicsNonZeroParity.md) compares one-step and multi-step kinematics.
- [Badge toggle shadow regression](BadgeToggleShadowRegression.md) records expansion and collapse checks.

The live pass is currently **blocked**. Obsidian is running, but this session exposes no callable `node_repl`, `@oai/sky`, or equivalent Computer Use tool for observing elements and performing pointer gestures safely. Re-run this matrix in a session with Computer Use enabled, or execute the scenarios manually in Obsidian and fill the result and evidence columns above. A9 should be marked complete only after the matrix has recorded results for all applicable scenarios.

## E2 execution record — 2026-09-08

**Result: Blocked.** Obsidian processes were detected and the vault configuration is present, but this session exposed no callable node_repl, @oai/sky, or equivalent Computer Use interface. No pointer gesture or UI-state claim was made. All matrix scenarios remain Blocked until the matrix is run manually in Obsidian or from a session with Computer Use enabled.

## Render-visibility regression record — 2026-09-19

Automated coverage now verifies that active ordinary LinkType relationships render when both endpoint nodes are already visible, without re-enabling global node discovery; populated badges remain visible on unselected nodes; empty badges remain available through selection or show-all mode; and scaled relationship lines keep a one-screen-pixel minimum. The complete automated suite passes with 87 test files and 401 tests.

Visible Obsidian confirmation remains **Blocked** for this session because Computer Use reported no available app or browser surfaces. After reloading the built plugin, manually confirm that `Graph Note 123.md` displays the expected `parts` and `blocked_and` lines, that populated badges remain visible after deselection, and that selecting a node reveals empty configured badges.

The first manual retest still showed no relationship lines or badges. Investigation found that Obsidian was loading the installed `.obsidian/plugins/nosygraph` bundle, which had no settings file and therefore used the default `O3/LinkTypes` folder, while this vault stores definitions in `System/LinkTypes`. The live resolver now loads valid definitions explicitly referenced by the graph note regardless of registry-folder location. A second manual confirmation is required after the rebuilt bundle is synchronized to the enabled plugin folder and reloaded.
