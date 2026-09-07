# GraphContainerAnchoring

## Purpose and status

Pure extraction of `GraphEngine.anchorContainersToParents()` and its attachment calculations. A2 extracted this boundary; A3 now composes it into the experimental staged engine. The live solver remains unchanged.

Implementation: [`GraphContainerAnchoring.ts`](../../src/graph-domain/GraphContainerAnchoring.ts). Tests: [`GraphContainerAnchoring.test.ts`](../../src/graph-domain/GraphContainerAnchoring.test.ts).

## Detached state boundary (A1)

Container identity, kind, origin, membership, ancestry, and gravity stay in [GraphPhysicsContainers](GraphPhysicsContainers.md). A separate `ContainerId` map of `GraphContainerAnchorState` holds evolving bounds, direction, independently optional last-origin coordinates, anchor velocity, and collision pressure.

Runtime bounds are authoritative for anchoring. Returned container records receive copies of updated bounds for existing force/confinement consumers. They are detached projections, not a second mutable owner.

Node motion uses [GraphKinematicsFrame](GraphKinematicsFrame.md). A separate per-node `GraphAnchoringFixedCoordinates` map holds effective fixed X/Y axes. Each axis may independently be missing, null, or nonfinite. The staged engine retains these coordinates without changing independent pin, lock, direction, or drag targets; see [GraphPhysicsAnchoringState](GraphPhysicsAnchoringState.md).

## Contract

`anchor(input)` takes a motion frame, projected physics nodes with effective radii, container definitions, anchor state, fixed coordinates, effective rest threshold, and minimum viewport size. The caller supplies the legacy minimum `max(44, baseNodeRadius * 2.2)`, not a minimum based on each origin's radius.

It returns detached motion, runtime state, container projections, fixed coordinates, diagnostics, and `maxVelocity: 0`. Node velocities and structural revision are preserved. No sequence number is assigned. All output maps and nested records are detached from input.

The caller supplies validated unique IDs/membership, finite node positions/radii and settings, and explicit runtime entries. Missing runtime entries are reported and skipped, not reconstructed from stale snapshot bounds. Missing origins are skipped after resetting anchor velocity and collision pressure; missing members are reported when translation is attempted. Runtime entries outside the active container list are copied unchanged; lifecycle pruning belongs to the future owner.

## Preserved behavior

1. Reset anchor velocity and collision pressure for all active containers before processing origins.
2. Process parents before embedded containers, retaining input order within each kind. Later containers observe earlier member translations; shared members may move repeatedly.
3. Origin history falls back to current position independently per missing/nonfinite axis. Origin movement must reach `max(restVelocityThreshold, 0.02)` to permit parent member translation.
4. Preserve width/height, increasing each to the supplied minimum when required.
5. Normalize parent direction. Center offset is the minimum rectangle ray-support distance plus effective radius plus `max(4, radius * 0.2)`. Direction-axis cutoff is `0.0001`.
6. Translate parent members only when center movement also reaches `max(restVelocityThreshold, 0.01)`. Shift positions and each finite fixed axis independently, preserving velocities.
7. Embedded containers center on origins without translating members or normalizing direction in this operation.
8. Update history after member translation, including self-membership behavior. Contribute zero to the legacy maximum velocity.

The legacy zero-direction calculation can produce nonfinite bounds. A focused test preserves this degeneracy; inventing a fallback direction would be a separate behavior change.

## Validation and integration work

Tests cover geometry, minimum dimensions, dead zones, history fallback, fixed axes, embedded behavior, missing references, sequential/shared/self-membership, repeated pure calls, and detachment.

A3 now composes forces -> [GraphMotionIntegrator](GraphMotionIntegrator.md) -> [GraphContainerConfinement](GraphContainerConfinement.md) -> anchoring -> confinement again in [StagedGraphPhysicsEngine](StagedGraphPhysicsEngine.md). [GraphPhysicsAnchoringState](GraphPhysicsAnchoringState.md) supplies the explicit seed and retains updated bounds/history and effective fixed coordinates between steps. Staged multi-step tests now cover this composition. Legacy capture, dynamic synchronization, broader lifecycle reconciliation, and live parity remain pending.
