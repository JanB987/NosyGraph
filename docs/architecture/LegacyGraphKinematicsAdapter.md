# LegacyGraphKinematicsAdapter

## Purpose

`LegacyGraphKinematicsAdapter` copies current legacy node motion into a detached [GraphKinematicsFrame](GraphKinematicsFrame.md).

Current implementation: [`src/graph-application/LegacyGraphKinematicsAdapter.ts`](../../src/graph-application/LegacyGraphKinematicsAdapter.ts)

## Rules

- Trim and reject blank node identities.
- Keep the first sample when an identity is repeated and report later occurrences.
- Copy every position and velocity object.
- Preserve non-finite values so [GraphKinematicsFrameDiagnostics](GraphKinematicsFrameDiagnostics.md) can report invalid samples rather than silently hiding them.
- Stamp the frame with sequence and structural revision supplied by the runtime boundary.

## Connections

- Adapts the current `GraphEngine` node representation without importing it.
- Produces [GraphKinematicsFrame](GraphKinematicsFrame.md).
- Supplies future legacy-side evidence to [GraphKinematicsFrameDiagnostics](GraphKinematicsFrameDiagnostics.md).
- Does not publish to [GraphKinematicsStore](GraphKinematicsStore.md) or step [GraphPhysicsEngine](GraphPhysicsEngine.md).

## Production capture

`GraphEngine.captureLegacyKinematicsFrame()` copies every current node's identity, position, and velocity. It uses the engine's shared topology revision and a caller-supplied sequence. The method does not publish to a store or affect the animation loop.

GraphPhysicsShadowSampleService now composes input and legacy-frame captures into one version-checked diagnostic sample.
