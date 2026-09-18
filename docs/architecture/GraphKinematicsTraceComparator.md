# GraphKinematicsTraceComparator

## Purpose

[GraphKinematicsTraceComparator](../../src/graph-application/GraphKinematicsTraceComparator.ts) compares synchronized detached solver traces one frame at a time. It is the multi-step companion to [GraphKinematicsFrameComparator](GraphKinematicsFrameComparator.md).

## Comparison rules

- Expected and actual traces must contain the same number of frames.
- Each frame is compared by stable node identity, exact sequence, and exact structural revision.
- Position and velocity use separate non-negative Euclidean-distance tolerances.
- The result reports every per-step comparison plus maximum position and velocity distances observed across the trace.
- A trace length mismatch contributes to differenceCount without discarding the frames that were comparable.

The default frame tolerances remain 0.001. Controlled solver parity fixtures may use tighter tolerances when both sides use the same detached arithmetic.

## Connections

- [GraphPhysicsExperimentRunner](GraphPhysicsExperimentRunner.md) produces a trace from one captured starting input.
- [GraphPhysicsNon-zero-step parity](GraphPhysicsNonZeroParity.md) records the first staged multi-step comparison.
- The comparator does not capture legacy state, advance a live engine, publish frames, or mutate inputs.
