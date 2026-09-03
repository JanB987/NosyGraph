# GraphKinematicsFrame

## Purpose

`GraphKinematicsFrame` is one host-neutral sample of node positions and velocities. It separates rapidly changing motion from the slower semantic graph state guarded by a structural revision.

Current implementation: [`src/graph-domain/GraphKinematicsFrame.ts`](../../src/graph-domain/GraphKinematicsFrame.ts)

## Shape

```ts
interface GraphKinematicsFrame {
  sequence: number;
  structuralRevision: number;
  positions: ReadonlyMap<NodeInstanceId, Readonly<GraphPoint>>;
  velocities: ReadonlyMap<NodeInstanceId, Readonly<GraphVector>>;
}
```

- `sequence` orders physics frames. It may advance many times between structural changes.
- `structuralRevision` records which semantic graph snapshot physics used to calculate the frame.
- `positions` and `velocities` are keyed by stable node-instance identity rather than note path.

`GraphKinematicsFrameInput` is the same data without `sequence`; the owning store assigns that number when publication succeeds.

## Why both counters exist

A note or badge expansion may perform asynchronous work guarded by structural revision 12. Animation frames 400 through 430 can arrive while that work runs without making it stale. Only a structural graph command advancing revision 12 invalidates it.

The structural revision stamp also lets a future snapshot composer detect that a physics frame was calculated for an older topology.

## Connections

- Owned and detached by [GraphKinematicsStore](GraphKinematicsStore.md).
- Produced in the future by [PhysicsEngine](PhysicsEngine.md).
- Uses position and velocity types from [GraphNodeInstance](GraphNodeInstance.md).
- Will be combined with semantic snapshots for [GraphRenderer](GraphRenderer.md).
- Summarized for bounded parity evidence by [GraphKinematicsFrameDiagnostics](GraphKinematicsFrameDiagnostics.md).
- Implements the sequencing decision in [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md).
