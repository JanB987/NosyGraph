# GraphMotionIntegrator

## Purpose

`GraphMotionIntegrator` applies accumulated velocity deltas, legacy constraint priority, damping, and one position-integration tick without mutating input.

Current implementation: [`src/graph-domain/GraphMotionIntegrator.ts`](../../src/graph-domain/GraphMotionIntegrator.ts)

## Constraint priority

1. Whole-simulation freeze retains position and velocity.
2. Topology and dragged-lens-descendant freezes zero velocity; a lens owner does the same unless actively dragged.
3. A non-dragged direction target fixes position and zeroes velocity.
4. A transient position lock fixes position and zeroes velocity.
5. A persistent pin fixes position and zeroes velocity.
6. Alt-drag freeze zeroes velocity.
7. A drag target fixes position while retaining velocity.
8. A free node adds force deltas, multiplies velocity by damping, and advances position by one legacy tick.

Transient pin-reposition locks precede persistent pins so the temporary target can move pinned intent safely. Each node receives an outcome for diagnostics, and `maxVelocity` includes only freely integrated nodes, matching the live loop.

## Connections

- Consumes deltas from [GraphForceAccumulator](GraphForceAccumulator.md).
- Interprets [GraphPhysicsConstraints](GraphPhysicsConstraints.md).
- Produces an unsequenced [GraphKinematicsFrame](GraphKinematicsFrame.md).
- Does not yet apply parent or embedded bounds; boundary confinement is the next extraction.

## Next extraction

[StagedGraphPhysicsEngine](StagedGraphPhysicsEngine.md) now composes integration, [confinement](GraphContainerConfinement.md), [anchoring](GraphContainerAnchoring.md), and confinement again. Anchoring retains effective fixed coordinates separately from integration's pin/lock/drag/direction targets.
