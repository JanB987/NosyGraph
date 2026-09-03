# GraphPhysicsParityService

## Purpose

`GraphPhysicsParityService` composes copied legacy motion, one isolated replacement-engine experiment, and bounded per-node comparison.

Current implementation: [`src/graph-application/GraphPhysicsParityService.ts`](../../src/graph-application/GraphPhysicsParityService.ts)

## Safe default

The default `deltaTime` is zero. On a live graph, this checks whether semantic-to-physics projection preserves node identities, positions, velocities, sequence, and structural revision. It does not claim force-algorithm parity.

An explicit non-negative step is supported for controlled fixtures. Meaningful live non-zero comparison will require a synchronized sampling hook because the legacy animation can otherwise advance between independent captures.

## Connections

- Captures current motion through [LegacyGraphKinematicsAdapter](LegacyGraphKinematicsAdapter.md).
- Runs replacement motion through [GraphPhysicsExperimentRunner](GraphPhysicsExperimentRunner.md).
- Compares frames with [GraphKinematicsFrameComparator](GraphKinematicsFrameComparator.md).
- Returns experiment input/frame summaries and legacy adapter diagnostics.
- Does not publish, render, mutate, retain engines, or log.

## Next extraction

Expose only the safe zero-step parity check through `GraphEngine`. Keep stepped experiments at the application boundary until synchronized sampling exists.
