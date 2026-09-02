# GraphPhysicsInputProjector

## Purpose

`GraphPhysicsInputProjector` removes note, badge, ownership, lens, selection, and rendering concerns from a graph snapshot, producing [GraphPhysicsInput](GraphPhysicsInput.md).

Current implementation: [`src/graph-application/GraphPhysicsInputProjector.ts`](../../src/graph-application/GraphPhysicsInputProjector.ts)

The projector is stateless, host-neutral, and dormant. It does not replace any live `GraphEngine` physics preparation yet.

## Current API

```ts
class GraphPhysicsInputProjector {
  project(
    snapshot: GraphSnapshot,
    structuralRevision: number,
    frameSequence: number
  ): GraphPhysicsInputProjectionResult;
}
```

## Projection rules

- Preserve each node instance even when several instances visualize the same note.
- Copy position and velocity objects so physics cannot mutate the source snapshot.
- Preserve node and edge context IDs for later isolation decisions.
- Retain `linkTypeId` for later force-settings lookup.
- Include an edge only when both endpoint node instances exist.
- Report excluded dangling edges as `ignoredEdgeIds` diagnostics.

Filtering a dangling edge is a defensive read-boundary rule. Store-mode initialization must still reject structurally invalid graphs rather than relying on this filter.

## Connections

- Receives snapshots from [GraphSnapshotKinematicsComposer](GraphSnapshotKinematicsComposer.md).
- Produces [GraphPhysicsInput](GraphPhysicsInput.md).
- Will isolate the future [PhysicsEngine](PhysicsEngine.md) from `GraphStore`, Obsidian, and rendering details.
- Preserves context needed by [GraphContainer](GraphGroupAndContainer.md) physics policy.
