# GraphPhysicsParityService

## Purpose

GraphPhysicsParityService composes copied legacy motion, one isolated replacement-engine experiment, and bounded per-node comparison.

Current implementation: [src/graph-application/GraphPhysicsParityService.ts](../../src/graph-application/GraphPhysicsParityService.ts)

## Safe default

The default deltaTime is zero. On a live graph, this checks whether semantic-to-physics projection preserves node identities, positions, velocities, sequence, and structural revision. It does not claim force-algorithm parity.

An explicit non-negative step remains supported for controlled fixtures. [GraphPhysicsExperimentRunner](GraphPhysicsExperimentRunner.md) now also runs several steps from one captured input, and [GraphKinematicsTraceComparator](GraphKinematicsTraceComparator.md) compares that trace with synchronized expected frames.

## Production wiring

GraphEngine.compareArchitecturePhysicsParity() exposes only the safe zero-step check. Callers may configure frame tolerances and report bounds, but the method does not accept deltaTime. It is never called automatically.

The first controlled result is recorded in [Non-zero-step parity](GraphPhysicsNonZeroParity.md). Meaningful live non-zero comparison still requires a synchronized sampling hook so the legacy animation cannot advance between independent captures.
