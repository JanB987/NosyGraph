# GraphKinematicsStore

## Purpose

`GraphKinematicsStore` exclusively owns the latest [GraphKinematicsFrame](GraphKinematicsFrame.md) and its sequence number.

Current implementation: [`src/graph-application/GraphKinematicsStore.ts`](../../src/graph-application/GraphKinematicsStore.ts)

The class is dormant. The live engine still changes positions and velocities on its legacy node objects.

## Current API

```ts
class GraphKinematicsStore {
  constructor(initialFrame: GraphKinematicsFrameInput);
  getSequence(): number;
  getFrame(): GraphKinematicsFrame;
  publishFrame(
    frame: GraphKinematicsFrameInput,
    expectedSequence?: number
  ): GraphKinematicsPublishResult;
}
```

## Behavior

- Every accepted publication receives the next frame sequence.
- A stale expected sequence returns `sequence-mismatch` without changing the current frame.
- Returned maps and coordinate objects are detached copies.
- Publishing a frame does not touch [GraphStore](GraphStore.md) or its structural revision.
- The frame retains the structural revision from which physics calculated it.

An accepted frame advances even when its coordinates equal the previous frame. Sequence describes publication order, not semantic difference.

## Connections

- Owns [GraphKinematicsFrame](GraphKinematicsFrame.md) values.
- Will receive output from [PhysicsEngine](PhysicsEngine.md).
- Will supply the latest compatible positions and velocities to a render-snapshot composer.
- Remains separate from [GraphRuntimeState](GraphRuntimeState.md), which owns semantic snapshots and structural changes.

## Snapshot composition

GraphSnapshotKinematicsComposer now overlays compatible frames without mutating either source. Remaining work is live render-snapshot wiring and activation-gate validation.
