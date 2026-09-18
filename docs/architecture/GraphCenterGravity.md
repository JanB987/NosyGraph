# GraphCenterGravity

## Purpose

`calculateGraphCenterGravity()` selects and calculates the legacy centering rule for one projected physics node without mutation.

Current implementation: [`src/graph-domain/GraphCenterGravity.ts`](../../src/graph-domain/GraphCenterGravity.ts)

## Selection order

1. A node whose context is `embedded:<container id>` receives that embedded container's gravity.
2. A member of a parent container receives no world-centering force.
3. Every other node receives `-position * centerStrength` toward the world origin.

Embedded gravity targets the bounds center. Its dead zone is `max(restVelocityThreshold * 8, 0.25)`, and force scales by the distance outside that zone and the container's normalized gravity strength.

This function does not decide whether a lock, drag, direction target, or freeze prevents integration. That is the next integration boundary's responsibility.

## Connections

- Reads nodes from [GraphPhysicsInput](GraphPhysicsInput.md).
- Reads normalized [GraphPhysicsContainers](GraphPhysicsContainers.md) and settings.
- Complements [GraphForceAccumulator](GraphForceAccumulator.md).
- Implements the centering section recorded in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).

## Current status

Center gravity is now part of the staged force accumulator. Remaining work is live input capture and non-zero-step parity validation.
