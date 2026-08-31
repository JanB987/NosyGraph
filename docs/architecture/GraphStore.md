# GraphStore

## Purpose

`GraphStore` is the single owner of runtime graph state. It makes state changes explicit and observable.

Current implementation: [`src/graph-application/GraphStore.ts`](../../src/graph-application/GraphStore.ts)

The migration begins with selection state. Other state categories remain in the legacy engine until their individual behavior is characterized.

## Current selection call flow

```text
mouse, keyboard, marquee, context menu, or drag interaction
                          |
                          v
                 legacy GraphEngine
                          |
                          v
                   GraphController
                          |
                          v
                     GraphStore
                          |
                          v
             render and read-only snapshot
```

`GraphEngine` no longer owns a `selectedNodeIds` set. It reads selection from the store and sends mutations through [GraphController](GraphController.md). Selection affects badge visibility, selection rings, labels, copying, pinning, dragging, badge drops, marquee selection, and `GraphQueries` snapshots.

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
  getSelectedNodeIds(): readonly NodeInstanceId[];
  getSelectedNodeCount(): number;
  isNodeSelected(nodeId: NodeInstanceId): boolean;
  selectOnly(nodeId: NodeInstanceId): boolean;
  toggleSelection(nodeId: NodeInstanceId): boolean;
  replaceSelection(nodeIds: Iterable<NodeInstanceId>): boolean;
  clearSelection(): boolean;

  // Target API after later state categories are migrated:
  getSnapshot(): GraphSnapshot;
  apply(changeSet: GraphChangeSet): void;
  replace(snapshot: GraphSnapshot): void;
  subscribe(listener: GraphStateListener): Unsubscribe;
}
```

`GraphSnapshot` and all collections returned from the store are read-only.

The [GraphChangeSet](GraphChangeSet.md) contract now exists, but `apply` remains a target API until nodes, edges, badges, expansions, notes, and lenses move from the legacy engine into this store.

## Connections

- Mutated by [GraphController](GraphController.md).
- Read through [GraphQueries](GraphQueries.md).
- Snapshots are consumed by [GraphRenderer](GraphRenderer.md) and [PhysicsEngine](PhysicsEngine.md).
- Serialized into [GraphDocument](GraphDocument.md) runtime state.

## Migration rule

Move one state category at a time. Once state moves into this store, delete its old duplicate owner rather than synchronizing two mutable copies.
