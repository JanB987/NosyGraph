# GraphPhysicsRuntimeInputComposer

## Purpose

`GraphPhysicsRuntimeInputComposer` creates one complete, detached input for a future physics runtime from the smaller graph, settings, node-constraint, and container boundaries.

Current implementation: [`src/graph-application/GraphPhysicsRuntimeInputComposer.ts`](../../src/graph-application/GraphPhysicsRuntimeInputComposer.ts)

The composer and `GraphPhysicsRuntimeInput` contract are dormant. The live loop still reads `GraphEngine` fields directly.

## Composition

```text
composed GraphSnapshot ----> GraphPhysicsInputProjector ----+
settings input ------------> settings normalizer ----------+
transient state + pins ----> constraint projector ---------+--> GraphPhysicsRuntimeInput
container candidates ------> container projector -----------+
```

The graph portion carries structural revision and frame sequence. Settings are fully normalized. Pins and transient constraints remain distinct. Container references are validated against the same snapshot.

The input contract also accepts optional [GraphPhysicsAnchoringState](GraphPhysicsAnchoringState.md). This composer and the legacy adapters do not yet capture it. Explicit staged-engine experiments with containers must attach a seed before positive stepping; zero-step inspection and the deterministic test engine still accept the existing composition.

Diagnostics from each projector remain grouped as `graph`, `constraints`, and `containers`, so callers can identify which boundary rejected legacy data.

## Connections

- Composes [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md).
- Normalizes [GraphPhysicsSettings](GraphPhysicsSettings.md).
- Composes [GraphPhysicsConstraintProjector](GraphPhysicsConstraintProjector.md).
- Composes [GraphPhysicsContainerProjector](GraphPhysicsContainerProjector.md).
- Produces the single input consumed by [PhysicsEngine](PhysicsEngine.md).

## Next extraction

[GraphPhysicsEngine](GraphPhysicsEngine.md) now supplies the compiled host-neutral interface and deterministic test implementation. The next extraction coordinates stepping and protected frame publication.
