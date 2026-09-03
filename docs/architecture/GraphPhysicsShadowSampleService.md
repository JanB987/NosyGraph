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

## Next extraction

Expose explicit sample capture through `GraphEngine`, then add a replacement-engine frame runner outside the production animation loop.
