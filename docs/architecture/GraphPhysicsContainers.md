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

[GraphContainerAnchoring](GraphContainerAnchoring.md) separates evolving bounds, direction, origin history, anchor velocity, and collision pressure into a runtime map. Membership/configuration stays here; anchoring returns updated bounds as a detached compatibility projection. Staged-engine integration is still pending.

`copyGraphPhysicsContainerState()` detaches container records, member arrays, bounds, and ancestry arrays.

## Connections

- Complements node constraints in [GraphPhysicsConstraints](GraphPhysicsConstraints.md).
- Supplies isolation, centering, bounds, and container-collision data to [PhysicsEngine](PhysicsEngine.md).
- Uses stable node IDs from [GraphPhysicsInput](GraphPhysicsInput.md).
- Is distinct from render-facing lens viewport state in [GraphLens](GraphLens.md).
- Preserves requirements found in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).

## Validated projection

[GraphPhysicsContainerProjector](GraphPhysicsContainerProjector.md) now validates origins, members, bounds, gravity, and ancestry against a snapshot and reports rejected references.

[LegacyGraphPhysicsContainerAdapter](LegacyGraphPhysicsContainerAdapter.md) prepares those candidates from copied legacy records without carrying graph-path ancestry into physics.
