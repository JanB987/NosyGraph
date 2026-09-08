# GraphPhysicsConstraintProjector

## Purpose

`GraphPhysicsConstraintProjector` combines persisted pin intent in a graph snapshot with transient runtime constraints, producing one detached [GraphPhysicsConstraintState](GraphPhysicsConstraints.md).

Current implementation: [`src/graph-application/GraphPhysicsConstraintProjector.ts`](../../src/graph-application/GraphPhysicsConstraintProjector.ts)

The projector is pure from the caller's perspective and dormant. It does not read legacy engine flags or alter live nodes.

## Current API

```ts
class GraphPhysicsConstraintProjector {
  project(
    snapshot: GraphSnapshot,
    transient: GraphTransientPhysicsConstraintInput
  ): GraphPhysicsConstraintProjectionResult;
}
```

## Projection rules

- Every snapshot node with `pinned: true` becomes one persistent pin at its composed position.
- Transient constraints for existing node IDs are retained in input order.
- Persistent and transient constraints for the same node remain separate and may coexist.
- A transient constraint for an absent node is excluded and returned in diagnostics.
- Whole-simulation freeze is copied independently of node constraints.
- All returned position objects and diagnostic constraints are detached.

Ignoring a missing-node transient constraint is safe for a read projection. The runtime coordinator remains responsible for removing obsolete interaction state from its own owner.

## Connections

- Derives semantic pin intent from snapshots supplied by [GraphRuntimeState](GraphRuntimeState.md).
- Accepts transient drag, lock, direction, and freeze state described by [GraphPhysicsConstraints](GraphPhysicsConstraints.md).
- Produces input for [PhysicsEngine](PhysicsEngine.md).
- Does not mutate [GraphStore](GraphStore.md) or advance [GraphKinematicsStore](GraphKinematicsStore.md).

## Current status

GraphPhysicsContainerProjector now supplies container membership, bounds, ancestry, and anchor relationships to the staged runtime.
