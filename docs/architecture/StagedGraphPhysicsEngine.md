# StagedGraphPhysicsEngine

## Purpose

`StagedGraphPhysicsEngine` is an experimental [GraphPhysicsEngine](GraphPhysicsEngine.md) assembled from the pure legacy-compatible solver stages extracted so far.

Current implementation: [`src/graph-application/StagedGraphPhysicsEngine.ts`](../../src/graph-application/StagedGraphPhysicsEngine.ts)

## Step pipeline

```text
current detached motion
  -> GraphForceAccumulator
  -> GraphMotionIntegrator
  -> GraphContainerConfinement
  -> detached frame + stage diagnostics
```

Every positive finite `deltaTime` performs one legacy tick; its magnitude is intentionally ignored because the live loop is frame-based. Zero or invalid delta returns current motion unchanged for safe inspection.

## Current parity scope

Implemented: ordinary node repulsion, force-link springs, world and embedded gravity, constraint priority, damping, integration, and parent confinement.

Not yet implemented: node-container repulsion, container-container repulsion, origin-anchor transfer, dynamic container synchronization, or settling cadence. This engine must not replace the live solver.

## Connections

- Implements [GraphPhysicsEngine](GraphPhysicsEngine.md).
- Can be injected into [GraphPhysicsExperimentRunner](GraphPhysicsExperimentRunner.md).
- Emits diagnostics from [GraphForceAccumulator](GraphForceAccumulator.md), [GraphMotionIntegrator](GraphMotionIntegrator.md), and [GraphContainerConfinement](GraphContainerConfinement.md).
- Is not constructed by `GraphEngine` and cannot publish or render.

## Next extraction

[GraphNodeContainerRepulsion](GraphNodeContainerRepulsion.md) now provides pure geometry and deltas. The next extraction adds its membership and origin-eligibility orchestration to the force accumulator.
