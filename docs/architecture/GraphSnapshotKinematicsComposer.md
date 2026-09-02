# GraphSnapshotKinematicsComposer

## Purpose

`GraphSnapshotKinematicsComposer` creates a detached render-ready snapshot by overlaying a compatible [GraphKinematicsFrame](GraphKinematicsFrame.md) onto semantic graph state.

Current implementation: [`src/graph-application/GraphSnapshotKinematicsComposer.ts`](../../src/graph-application/GraphSnapshotKinematicsComposer.ts)

The composer is host-neutral, stateless, and dormant. The live renderer still reads legacy node objects.

## Current API

```ts
class GraphSnapshotKinematicsComposer {
  compose(
    snapshot: GraphSnapshot,
    snapshotStructuralRevision: number,
    frame: GraphKinematicsFrame
  ): GraphKinematicsCompositionResult;
}
```

## Compatibility rule

The frame is applied only when `frame.structuralRevision` exactly equals the snapshot's structural revision. Older and newer frames both return `structural-revision-mismatch`; no position or velocity from that frame is used.

This prevents a frame calculated for one node topology from being mixed into another.

## Missing-node behavior

For a compatible frame:

- A supplied position or velocity replaces that one coordinate component.
- A missing position or velocity falls back to the value already in the semantic snapshot.
- A frame entry for a node absent from the snapshot is ignored.
- Diagnostics list updated nodes, fallbacks, and ignored frame node IDs.

Partial frames are therefore safe and observable. They do not cause nodes to disappear or silently reset to zero.

## Detachment

The result is a complete detached copy, including nested note properties, node coordinates and origins, expansion ownership arrays, and lens geometry. Neither input is mutated and callers cannot mutate either source through the result.

The reusable `copyGraphSnapshot()` function lives beside the `GraphSnapshot` domain contract.

## Connections

- Reads semantic snapshots from [GraphRuntimeState](GraphRuntimeState.md).
- Reads motion from [GraphKinematicsStore](GraphKinematicsStore.md).
- Produces the future input for [GraphRenderer](GraphRenderer.md).
- Supplies detached snapshots to [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md).
- Enforces the structural/frame compatibility rule from [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md).
