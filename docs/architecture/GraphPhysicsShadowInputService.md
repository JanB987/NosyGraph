# GraphPhysicsShadowInputService

## Purpose

`GraphPhysicsShadowInputService` composes a read-only, versioned [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) result from the current semantic runtime and copied legacy physics state.

Current implementation: [`src/graph-application/GraphPhysicsShadowInputService.ts`](../../src/graph-application/GraphPhysicsShadowInputService.ts)

It is a shadow boundary: it owns no simulation, does not call [GraphPhysicsEngine](GraphPhysicsEngine.md), and cannot publish a [GraphKinematicsFrame](GraphKinematicsFrame.md). `GraphEngine` constructs one instance and exposes it only through the explicit `captureArchitecturePhysicsInput()` diagnostic method.

## Inputs and output

```text
GraphRuntimeState -------------------- snapshot + structural revision
LegacyGraphPhysicsReadSource -------- copied settings, constraints, containers
caller ------------------------------ frame sequence
                                      |
                                      v
GraphPhysicsShadowInputService.capture()
                                      |
                                      v
GraphPhysicsRuntimeInput + grouped diagnostics
```

Each call reads fresh state. Diagnostics retain both malformed legacy-entry counts and projection results for missing graph references.

## Connections

- Reads the selected [GraphRuntimeState](GraphRuntimeState.md).
- Wraps each copied physics state in [LegacyGraphPhysicsReadAdapter](LegacyGraphPhysicsReadAdapter.md).
- Delegates normalization and projection to [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md).
- Intentionally has no connection to [GraphPhysicsCoordinator](GraphPhysicsCoordinator.md).

## Production wiring

`GraphEngine` supplies:

- Its detached `LegacyGraphSnapshotAdapter` through [LegacyGraphRuntimeState](LegacyGraphRuntimeState.md).
- A structural revision incremented when the existing topology signature changes.
- Fresh copied physics state through `getLegacyPhysicsReadState()`.

The service is not called from the animation loop. [GraphPhysicsShadowDiagnostics](GraphPhysicsShadowDiagnostics.md) reduces explicit captures to compact summaries without logging whole graph snapshots.
