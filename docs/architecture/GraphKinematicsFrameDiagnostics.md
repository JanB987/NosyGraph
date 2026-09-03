# GraphKinematicsFrameDiagnostics

## Purpose

`GraphKinematicsFrameDiagnostics` summarizes the health and aggregate motion of a [GraphKinematicsFrame](GraphKinematicsFrame.md), then compares two summaries with an explicit numeric tolerance.

Current implementation: [`src/graph-application/GraphKinematicsFrameDiagnostics.ts`](../../src/graph-application/GraphKinematicsFrameDiagnostics.ts)

## Evidence retained

- Exact frame sequence and structural revision.
- Position, velocity, matched-node, and invalid-sample counts.
- Centroid, mean speed, and maximum speed for finite matched samples.

Versions and counts compare exactly. Aggregate floating-point values use the caller's non-negative tolerance. Missing pairs and non-finite values increase `invalidSampleCount` and are excluded from aggregates.

## Connections

- Consumes detached [GraphKinematicsFrame](GraphKinematicsFrame.md) values.
- Complements input-level [GraphPhysicsShadowDiagnostics](GraphPhysicsShadowDiagnostics.md).
- Accepts copied legacy frames from [LegacyGraphKinematicsAdapter](LegacyGraphKinematicsAdapter.md) and future frames from the new [GraphPhysicsEngine](GraphPhysicsEngine.md).
- Aggregate agreement is smoke evidence, not proof of per-node parity; focused per-node characterization remains necessary before cutover.

## Next extraction

Compose the explicit [LegacyGraphKinematicsAdapter](LegacyGraphKinematicsAdapter.md) frame with physics shadow input as one version-checked diagnostic sample.
