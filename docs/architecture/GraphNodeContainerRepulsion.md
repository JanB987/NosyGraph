# GraphNodeContainerRepulsion

## Purpose

`GraphNodeContainerRepulsion` contains the pure geometry and force calculation used when an ordinary node approaches a parent or embedded container.

Current implementation: [`src/graph-domain/GraphNodeContainerRepulsion.ts`](../../src/graph-domain/GraphNodeContainerRepulsion.ts)

## Container circle

- An embedded container with an available origin uses the origin's position and effective radius.
- A parent container, or an embedded container with no origin, uses its bounds center and half its largest dimension.

Inside or overlapping the boundary, magnitude is clamped to `0.5..8`. Outside, force fades to zero over the influence distance and is capped at `8`. Coincident centers use the same deterministic angle as [GraphLinkSpring](GraphLinkSpring.md).

The function returns equal and opposite node and origin deltas. [GraphPhysicsSettings](GraphPhysicsSettings.md) carries the influence distance derived from legacy base node radius. Eligibility—membership, separation, locks, drags, and whether an origin may react—remains an accumulator concern.

## Connections

- Reads resolved nodes from [GraphPhysicsInput](GraphPhysicsInput.md).
- Reads bounds and origins from [GraphPhysicsContainers](GraphPhysicsContainers.md).
- Will extend [GraphForceAccumulator](GraphForceAccumulator.md).
- Implements the node-container section of [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).

## Current status

Container-to-container repulsion is now composed by GraphForceAccumulator with explicit origin eligibility.
