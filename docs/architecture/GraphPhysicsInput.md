# GraphPhysicsInput

## Purpose

`GraphPhysicsInput` is the complete host-neutral data packet consumed by a future [PhysicsEngine](PhysicsEngine.md). It contains only motion-relevant node and edge fields.

Current implementation: [`src/graph-domain/GraphPhysicsInput.ts`](../../src/graph-domain/GraphPhysicsInput.ts)

## Shape

```ts
interface GraphPhysicsInput {
  structuralRevision: number;
  frameSequence: number;
  nodes: readonly GraphPhysicsNode[];
  edges: readonly GraphPhysicsEdge[];
}
```

`GraphPhysicsNode` contains stable node-instance ID, graph context, position, velocity, radius, and pinning. `GraphPhysicsEdge` contains stable edge and endpoint IDs, graph context, and link-type ID.

The link-type ID is retained because a later settings projection may choose different force strength or preferred distance by relationship type.

## Deliberately excluded

- Note paths, names, and properties
- Selection and badge state
- Expansion ownership
- Lens rendering geometry
- Obsidian objects
- Canvas or DOM handles

The version fields let physics identify both the semantic topology and the motion frame from which this input was prepared.

## Connections

- Created by [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md).
- Uses composed positions from [GraphSnapshotKinematicsComposer](GraphSnapshotKinematicsComposer.md).
- Will be consumed by [PhysicsEngine](PhysicsEngine.md).
- Its node contexts support future [GraphContainer](GraphGroupAndContainer.md) isolation policy.

The source trace in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md) shows that exact isolation also requires container membership, bounds, and transient constraint state; `contextId` alone is not a parity-complete physics input.
