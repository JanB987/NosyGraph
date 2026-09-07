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
  -> GraphContainerAnchoring
  -> GraphContainerConfinement (updated bounds)
  -> detached frame + stage diagnostics
```

Every positive finite `deltaTime` performs one legacy tick; its magnitude is intentionally ignored because the live loop is frame-based. Zero or invalid delta returns current motion unchanged for safe inspection.

The first confinement pass receives only nodes with an `integrated` outcome. Legacy pinned/locked/dragged/frozen/targeted nodes exit integration early. The final confinement pass covers all nodes after anchoring.

## Current parity scope

Implemented: ordinary node repulsion, force-link springs, world and embedded gravity, node-container and container-container repulsion with eligible origin reactions, constraint priority, damping, integration, parent confinement, anchoring/member translation, and a second confinement pass.

Updated container bounds, origin history, and fixed coordinates now persist between steps. Legacy anchor-state capture, dynamic container synchronization, topology reconciliation, and settling cadence remain. This engine must not replace the live solver.

## Connections

- Implements [GraphPhysicsEngine](GraphPhysicsEngine.md).
- Can be injected into [GraphPhysicsExperimentRunner](GraphPhysicsExperimentRunner.md).
- Emits diagnostics from [GraphForceAccumulator](GraphForceAccumulator.md), [GraphMotionIntegrator](GraphMotionIntegrator.md), and [GraphContainerConfinement](GraphContainerConfinement.md).
- Is not constructed by `GraphEngine` and cannot publish or render.

## Next extraction

[GraphContainerAnchoring](GraphContainerAnchoring.md) now runs after the first confinement pass, followed by confinement using the returned bounds. Diagnostics expose the first pass as `confinement`, then `anchoring` and `finalConfinement`. Force and integration diagnostics retain their existing meanings.

## Seed and state lifecycle

Container stepping requires explicit [GraphPhysicsAnchoringState](GraphPhysicsAnchoringState.md) in `GraphPhysicsRuntimeInput.anchoring`. No direction/history or base-radius minimum is guessed. Missing or incomplete seeds reject positive running steps before force accumulation; zero-step inspection remains available.

`setInput` copies graph, settings, constraints, containers, and anchor state. Seed bounds drive the first tick; returned bounds drive later forces and confinement. Updated fixed coordinates persist separately from existing pin, lock, direction, and drag targets. `getAnchoringState()` and step diagnostics return detached inspection data.

Tests verify stage order, both confinement passes, moving and stationary origins across ticks, embedded raw coordinates, independent pin targets, freeze/inspection behavior, seed rejection, and full input replacement. A4 will broaden lifecycle/revision reconciliation and capture coverage. `setInput` currently resets the simulation rather than merging a topology change.
