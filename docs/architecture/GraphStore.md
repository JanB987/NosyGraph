# GraphStore

## Purpose

`GraphStore` is the single owner of runtime graph state. It makes state changes explicit and observable.

## Owned state

- [GraphNodeInstance](GraphNodeInstance.md) objects
- [GraphEdge](GraphEdgeAndLinkType.md) objects
- Selection, roots, and pins
- [GraphExpansion](GraphExpansion.md) ownership
- [GraphLens](GraphLens.md) and container contexts
- Viewports and transient UI-independent runtime state

## Proposed API

```ts
class GraphStore {
  getSnapshot(): GraphSnapshot;
  apply(changeSet: GraphChangeSet): void;
  replace(snapshot: GraphSnapshot): void;
  subscribe(listener: GraphStateListener): Unsubscribe;
}
```

`GraphSnapshot` and all collections returned from the store are read-only.

## Connections

- Mutated by [GraphController](GraphController.md).
- Read through [GraphQueries](GraphQueries.md).
- Snapshots are consumed by [GraphRenderer](GraphRenderer.md) and [PhysicsEngine](PhysicsEngine.md).
- Serialized into [GraphDocument](GraphDocument.md) runtime state.

## Migration rule

Move one state category at a time. Once state moves into this store, delete its old duplicate owner rather than synchronizing two mutable copies.

