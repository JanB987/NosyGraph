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

The first confinement pass receives only nodes with an integrated outcome. Legacy pinned/locked/dragged/frozen/targeted nodes exit integration early. The final confinement pass covers all nodes after anchoring.

After the final confinement pass, [GraphSettlingPolicy](GraphSettlingPolicy.md) observes the integration maximum velocity. Low-velocity hysteresis and cadence are detached from the engine step; the policy transitions the staged engine to settled after 24 consecutive non-interacting rest frames by default.

## Current parity scope

Implemented: ordinary node repulsion, force-link springs, world and embedded gravity, node-container and container-container repulsion with eligible origin reactions, constraint priority, damping, integration, parent confinement, anchoring/member translation, and a second confinement pass.

Updated container bounds, origin history, and fixed coordinates now persist between steps. Legacy anchor-state capture, dynamic container synchronization, and topology reconciliation remain. Settling cadence is now extracted for staged experiments. This engine must not replace the live solver.

## Connections

- Implements [GraphPhysicsEngine](GraphPhysicsEngine.md).
- Can be injected into [GraphPhysicsExperimentRunner](GraphPhysicsExperimentRunner.md).
- Emits diagnostics from [GraphForceAccumulator](GraphForceAccumulator.md), [GraphMotionIntegrator](GraphMotionIntegrator.md), [GraphContainerConfinement](GraphContainerConfinement.md), and [GraphSettlingPolicy](GraphSettlingPolicy.md).
- Is not constructed by `GraphEngine` and cannot publish or render.

## Next extraction

[GraphContainerAnchoring](GraphContainerAnchoring.md) now runs after the first confinement pass, followed by confinement using the returned bounds. Diagnostics expose the first pass as `confinement`, then `anchoring` and `finalConfinement`. Force and integration diagnostics retain their existing meanings.

## Seed and state lifecycle

Container stepping requires explicit [GraphPhysicsAnchoringState](GraphPhysicsAnchoringState.md) in `GraphPhysicsRuntimeInput.anchoring`. No direction/history or base-radius minimum is guessed. Missing or incomplete seeds reject positive running steps before force accumulation; zero-step inspection remains available.

'setInput' copies graph, settings, constraints, containers, and anchor state, then reconciles compatible runtime state. Same-ID containers preserve bounds, direction, and history when kind and origin are unchanged. New containers require seeds; changed kind/origin resets from a seed; removed containers are pruned. Surviving node motion and fixed coordinates are retained by node ID, while new nodes use incoming values and removed nodes are pruned. Seed bounds drive the first tick for new/reset containers; returned bounds drive later forces and confinement. 'getAnchoringState()' and 'getAnchoringReconciliation()' return detached inspection data.

Tests verify stage order, both confinement passes, moving and stationary origins across ticks, embedded raw coordinates, independent pin targets, freeze/inspection behavior, seed rejection, and state reconciliation across structural updates. 'setInput' resets only the incoming projection while preserving compatible runtime state; a new engine instance is the explicit full reset boundary.

Settling tests verify the 24-frame rest hysteresis, near-settle cadence, interaction wake-up, freeze/resume, stopped/settled reheat, and settled-step no-op behavior. The staging engine exposes setInteractionActive and getTargetFrameIntervalMs for experiments; host timer scheduling is still outside this boundary.
