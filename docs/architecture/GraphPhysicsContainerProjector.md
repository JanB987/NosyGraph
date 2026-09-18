# GraphPhysicsContainerProjector

## Purpose

`GraphPhysicsContainerProjector` validates candidate [GraphPhysicsContainers](GraphPhysicsContainers.md) against a semantic snapshot and returns detached, physics-safe container state.

Current implementation: [`src/graph-application/GraphPhysicsContainerProjector.ts`](../../src/graph-application/GraphPhysicsContainerProjector.ts)

It is dormant and does not read or mutate live legacy container maps.

## Validation rules

- Container IDs must be nonblank and unique among accepted candidates.
- The origin node must exist in the snapshot.
- All bounds must be finite and ordered left-to-right and top-to-bottom.
- Embedded gravity must be finite and is clamped to the legacy `0..1` range.
- Missing member nodes are excluded and reported.
- Duplicate member IDs are collapsed in first-seen order.
- Missing and self-referencing parent IDs are excluded and reported.
- A parent edge that would create an ancestry cycle is excluded and reported.

Invalid containers are rejected as complete records. Invalid member or ancestry references do not discard an otherwise usable container.

## Diagnostics

The result separates rejected containers, ignored member references, and ignored parent references. Parent diagnostics distinguish missing containers, self-reference, and cycle formation.

This keeps compatibility projections resilient while allowing store-mode initialization to enforce stricter all-or-nothing validation later.

## Connections

- Validates node references against snapshots from [GraphRuntimeState](GraphRuntimeState.md).
- Produces detached [GraphPhysicsContainers](GraphPhysicsContainers.md).
- Complements [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md) and [GraphPhysicsConstraintProjector](GraphPhysicsConstraintProjector.md).
- Will supply [PhysicsEngine](PhysicsEngine.md) without exposing lens DOM or legacy container objects.
- Receives translated candidates from [LegacyGraphPhysicsContainerAdapter](LegacyGraphPhysicsContainerAdapter.md).

## Next extraction

Compose graph input, settings, node constraints, and container constraints behind one versioned `GraphPhysicsRuntimeInput` boundary.
