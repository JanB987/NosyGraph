# LegacyGraphPhysicsContainerAdapter

## Purpose

`LegacyGraphPhysicsContainerAdapter` converts current parent and embedded container records into host-neutral [GraphPhysicsContainers](GraphPhysicsContainers.md).

Current implementation: [`src/graph-application/LegacyGraphPhysicsContainerAdapter.ts`](../../src/graph-application/LegacyGraphPhysicsContainerAdapter.ts)

The adapter consumes a narrow read shape and is not connected to live private engine maps yet.

## Mapping rules

- Legacy keys become stable container IDs.
- Origins and members become stable node-instance IDs.
- Scalar edges become a detached bounds object.
- Embedded `linkForce` becomes gravity strength.
- Parent-container IDs are derived from containers whose member set contains the candidate's origin node.

Deriving nesting from origin membership avoids leaking graph paths or embedded ancestry strings into physics. It also preserves overlapping parents when several containers contain the same origin.

This adapter translates rather than validates. [GraphPhysicsContainerProjector](GraphPhysicsContainerProjector.md) remains responsible for missing nodes, malformed bounds, duplicate IDs, gravity normalization, and ancestry cycles.

## Connections

- Produces candidates for [GraphPhysicsContainerProjector](GraphPhysicsContainerProjector.md).
- Complements the legacy settings and constraint adapters.
- Preserves container behavior recorded in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).
- Will eventually receive copied records from `GraphEngine` rather than access its maps directly.

## Next extraction

Compose the three legacy physics adapters behind one read facade, then add a thin dormant `GraphEngine` snapshot method for that facade.
