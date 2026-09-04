# GraphContainerRepulsion

## Purpose

`GraphContainerRepulsion` defines pure container-pair eligibility and equal/opposite force transfer to their origin nodes.

Current implementation: [`src/graph-domain/GraphContainerRepulsion.ts`](../../src/graph-domain/GraphContainerRepulsion.ts)

Containers do not repel when they are identical, one contains the other's origin, or they share any member. Exterior force fades across `containerContainerInfluenceDistance`; overlap force is capped at `repulsionStrength / 40`. Coincident centers use the shared deterministic angle.

## Connections

- Uses circles resolved by [GraphNodeContainerRepulsion](GraphNodeContainerRepulsion.md).
- Reads normalized range from [GraphPhysicsSettings](GraphPhysicsSettings.md).
- Will extend [GraphForceAccumulator](GraphForceAccumulator.md).
- Implements container-pair behavior from [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).

## Next extraction

Apply eligible container-pair reactions to origin nodes in the force accumulator.
