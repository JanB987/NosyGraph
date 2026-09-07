# GraphKinematicsFrameComparator

## Purpose

GraphKinematicsFrameComparator compares two detached [GraphKinematicsFrame](GraphKinematicsFrame.md) values by stable node identity.

Current implementation: [src/graph-application/GraphKinematicsFrameComparator.ts](../../src/graph-application/GraphKinematicsFrameComparator.ts)

## Comparison rules

- Sequence and structural revision must match exactly.
- Every node must have both a position and velocity sample on both sides.
- Position and velocity use separate non-negative Euclidean-distance tolerances.
- Non-finite distances are differences.
- Node identities are sorted for deterministic reports.
- differenceCount remains complete while reportedDifferences is bounded by maxReportedDifferences.
- maxPositionDistance and maxVelocityDistance retain the largest observed errors for trace-level investigation.

Metadata mismatches contribute to differenceCount but are represented by the explicit boolean fields rather than fake node differences.

## Connections

- Compares copied legacy frames from [LegacyGraphKinematicsAdapter](LegacyGraphKinematicsAdapter.md).
- Compares isolated replacement frames from [GraphPhysicsExperimentRunner](GraphPhysicsExperimentRunner.md).
- Complements aggregate [GraphKinematicsFrameDiagnostics](GraphKinematicsFrameDiagnostics.md).
- [GraphKinematicsTraceComparator](GraphKinematicsTraceComparator.md) composes this comparison across multiple synchronized steps.
- Does not run physics, mutate frames, publish results, or log.
