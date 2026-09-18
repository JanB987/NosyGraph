# Legacy Solver Parity Audit

## Purpose

This audit compares the live solver in [GraphEngine](../../src/GraphEngine.ts) with the detached replacement stages. It records what the replacement can prove today, where the host boundary is intentionally responsible, and which gaps must be closed before live physics activation.

The audit covers the requested solver behavior: constraints, dragging, persistent pins, freezes, directional links, lenses, and force eligibility.

## Findings

| Behavior | Legacy source surface | Replacement coverage | Status and remaining work |
|---|---|---|---|
| Constraint precedence | `simulateForceLayout` integrates topology freezes, lens descendants, direction targets, locks, Alt-drag freezes, pins, and active drag in a fixed order. | `GraphMotionIntegrator` applies the same explicit outcome order; `GraphForceAccumulator` blocks transient force recipients while allowing position locks to accumulate discarded force. | **Covered for one detached tick.** Keep the precedence tests when the live adapter is wired. |
| Constraint projection | `getLegacyPhysicsReadState` reads focal locks, pin-reposition locks, drag targets, direction targets, and all four velocity-freeze reasons. | `LegacyGraphPhysicsConstraintAdapter`, `GraphPhysicsConstraintProjector`, and `GraphPhysicsRuntimeInputComposer` validate and detach those collections. | **Covered at the input boundary.** The adapter still depends on the host to update these collections every interaction frame. |
| Persistent pins | `applyPinnedStateToNode` restores persisted coordinates; `isLocked` plus `lockX/lockY` enforce the pin during integration. | Snapshot pin intent becomes `persistentPins`; the integrator applies the supplied position and zeros velocity. | **Covered for supplied state.** Persisted-position restoration and runtime-ID resolution remain legacy adapter responsibilities. |
| Dragging | `updateDraggedNodePositions` translates the primary node and selected nodes; lens descendants move with their owner; cancel restores origin positions; completion persists positions. | A detached `drag-target` constraint can place each node, and `dragged-lens-descendant` can freeze descendants. | **Partial by design.** Pointer tracking, multi-node translation, cancel/restore, persistence, and badge-drop lifecycle remain controller/host work. A live replacement must project those results before each tick. |
| Whole-simulation freeze | `simulationFrozenByHotkey` makes `simulate` return zero while the animation loop continues and existing velocities remain available for resume. | `GraphSettlingPolicy.freeze/resume` preserves settling progress; staged `freeze/resume` preserves the detached frame and blocks stepping. | **Covered for detached state.** requestAnimationFrame continuation, hotkey ownership, and scheduler wake-up are not part of the staged engine. |
| Topology and Alt-drag freezes | `topologyUpdateFrozenNodeIds` and `altDragFrozenNodeIds` zero velocity until the legacy lifecycle clears them. | Explicit velocity-freeze reasons are consumed by force and integration stages. | **Partial.** The representation and one-tick behavior match; automatic clearing after topology settling or interaction end still belongs to an application coordinator. |
| Directional links | `computeDirectionLockedTargets` solves roots, siblings, multi-parent midpoint placement, occupied positions, and unresolved cycles; integration assigns solved positions. | Settings normalize direction policies; force accumulation skips direction edges; integration accepts precomputed `direction-target` constraints. | **Major gap.** The target solver itself has not been extracted. Direction targets must currently be supplied by the legacy host, so the replacement cannot independently reproduce direction layout. |
| Lenses and embedded graphs | Embedded containers carry bounds, gravity, owner/descendant relationships, raw-layout coordinates, ancestry, viewport state, and interaction lifecycle. | Runtime input carries detached embedded containers, bounds, gravity, member IDs, and owner/descendant freeze constraints. Embedded raw coordinates are intentionally not clamped. | **Partial.** Lens viewport/pan/zoom/maximize state is outside physics, but nested ancestry is also absent from `GraphPhysicsNode`; dynamic container synchronization is extracted but not wired into the staged engine. |
| Node and edge force eligibility | `nodesAreSeparatedByContainerBoundary`, `isNodePartOfContainer`, and `isNodePartOfEmbeddedContainer` use direct membership plus embedded ancestry. Overlay and direction edges are excluded from springs. | Overlay/dangling edges, direction edges, direct member isolation, force recipients, node-container reactions, and container-pair reactions are covered by pure stages. | **Partial.** The accumulator uses direct `memberNodeIds`; it does not yet expand `parentContainerIds` or embedded ancestry for nested force isolation, gravity selection, container repulsion, or boundary eligibility. |
| Container bounds and origin history | `syncParentContainers`, `syncEmbeddedGraphContainers`, and `anchorContainersToParents` update bounds and origin history during every simulation tick. | `GraphPhysicsContainerSynchronizer` and `GraphContainerAnchoring` exist as separate stages; staged anchoring state persists between steps. | **Partial.** Synchronization and anchoring are not yet composed into one replacement tick. The staged engine currently expects its caller to provide current container candidates and an anchoring seed. |
| Effective radius | Legacy force and confinement use the resolved per-node effective radius, including connection-count growth and frontmatter size. | `GraphPhysicsInputProjector` carries a detached `radius`; pure stages use that value. | **Covered only when projection is correct.** A live activation gate must verify that the legacy adapter supplies the resolved effective radius rather than the base setting. |

## Evidence already in the repository

- [GraphMotionIntegrator tests](../../src/graph-domain/GraphMotionIntegrator.test.ts) cover simulation freeze, topology freeze precedence, direction targets, position locks, persistent pins, drag targets, and lens-owner precedence.
- [GraphForceAccumulator tests](../../src/graph-domain/GraphForceAccumulator.test.ts) cover direction-edge exclusion, transient force blocking, container separation, lens-owner reactions, gravity, node-container force, and container-pair force.
- [Legacy constraint adapter tests](../../src/graph-application/LegacyGraphPhysicsConstraintAdapter.test.ts) cover the legacy lock and freeze collections and invalid entries.
- [Runtime input composer tests](../../src/graph-application/GraphPhysicsRuntimeInputComposer.test.ts) cover detached pins, transient constraints, ignored edges, and container diagnostics.
- [Staged engine tests](../../src/graph-application/StagedGraphPhysicsEngine.test.ts) cover staged order, two confinement passes, anchoring state persistence, freeze/resume, settling, and reconciliation.
- [Container synchronizer tests](../../src/graph-domain/GraphPhysicsContainerSynchronizer.test.ts) cover recalculated bounds, embedded viewport dimensions, ancestry, and stale-container removal.

## Required follow-up before live activation

1. Extract the direction target solver and feed its result into the detached constraint projection.
2. Represent nested embedded ancestry or expand container membership before force accumulation, gravity, container-pair repulsion, and confinement claim parity.
3. Compose dynamic container synchronization, anchoring, and staged stepping behind one application coordinator.
4. Keep pointer interaction, pin persistence, native drag cancel/restore, and requestAnimationFrame scheduling in the application/host boundary, then add lifecycle parity tests there.
5. Add an activation gate that compares representative legacy and replacement frames for nested lenses, mixed direction/force edges, pinned-node repositioning, Alt-drag, topology refresh, and hotkey freeze/resume.

Until these items are addressed, the staged engine remains a parity experiment and must not replace the live solver.
