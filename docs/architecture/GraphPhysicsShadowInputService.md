# GraphPhysicsShadowInputService

## Purpose

`GraphPhysicsShadowInputService` composes a read-only, versioned [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) result from the current semantic runtime and copied legacy physics state.

Current implementation: [`src/graph-application/GraphPhysicsShadowInputService.ts`](../../src/graph-application/GraphPhysicsShadowInputService.ts)

It is a shadow boundary: it owns no simulation, does not call [GraphPhysicsEngine](GraphPhysicsEngine.md), and cannot publish a [GraphKinematicsFrame](GraphKinematicsFrame.md).

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

## Next extraction

Wire one dormant instance in `GraphEngine` and expose its capture for inspection. Do not call it from the animation loop yet.
