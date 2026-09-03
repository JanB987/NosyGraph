# GraphPhysicsShadowSampleService

## Purpose

`GraphPhysicsShadowSampleService` joins compact input evidence and copied legacy motion evidence for one caller-supplied frame sequence.

Current implementation: [`src/graph-application/GraphPhysicsShadowSampleService.ts`](../../src/graph-application/GraphPhysicsShadowSampleService.ts)

## Flow

```text
GraphPhysicsShadowInputCapture -> GraphPhysicsShadowDiagnostics --+
                                                                  +-> sample
LegacyGraphKinematicsFrame ----> GraphKinematicsFrameDiagnostics --+
```

The sample is `ready` only when both captures have the same structural revision. A topology change between the two synchronous reads produces `revision-mismatch` with both revisions, so consumers cannot mistake a race for parity evidence.

## Connections

- Reads compact input evidence from [GraphPhysicsShadowInputService](GraphPhysicsShadowInputService.md).
- Reads copied motion through [LegacyGraphKinematicsAdapter](LegacyGraphKinematicsAdapter.md).
- Delegates summaries to [GraphPhysicsShadowDiagnostics](GraphPhysicsShadowDiagnostics.md) and [GraphKinematicsFrameDiagnostics](GraphKinematicsFrameDiagnostics.md).
- Does not retain full captures, run physics, publish frames, or log.

## Production wiring

`GraphEngine.captureArchitecturePhysicsSample()` explicitly captures one sample. The service delegates back to the engine's two detached capture methods, so both sides use the caller's sequence and the engine's topology revision. Nothing calls it from the animation loop.

The next extraction adds a replacement-engine frame runner outside the production animation loop.
