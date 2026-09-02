# GraphPhysicsContainers

## Purpose

`GraphPhysicsContainerState` represents spatial membership and boundaries without exposing legacy parent-container or embedded-lens objects.

Current implementation: [`src/graph-domain/GraphPhysicsContainers.ts`](../../src/graph-domain/GraphPhysicsContainers.ts)

The types are dormant and do not change live container behavior.

## Container variants

Both variants contain a stable container ID, origin-node ID, member-node IDs, bounds, and parent-container IDs.

- `parent` represents a relationship-created spatial container.
- `embedded` additionally carries the gravity strength that pulls members toward its center.

Explicit `parentContainerIds` replace legacy graph-path ancestry at the physics boundary. A node may belong to several containers, and containers may be nested.

## Copy function

`copyGraphPhysicsContainerState()` detaches container records, member arrays, bounds, and ancestry arrays.

## Connections

- Complements node constraints in [GraphPhysicsConstraints](GraphPhysicsConstraints.md).
- Supplies isolation, centering, bounds, and container-collision data to [PhysicsEngine](PhysicsEngine.md).
- Uses stable node IDs from [GraphPhysicsInput](GraphPhysicsInput.md).
- Is distinct from render-facing lens viewport state in [GraphLens](GraphLens.md).
- Preserves requirements found in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).

## Next extraction

Add a projector that validates container origins, members, bounds, and ancestry against the current graph snapshot and reports rejected references.
