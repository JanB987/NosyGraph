# GraphStore

## Purpose

`GraphStore` is the single owner of runtime graph state. It makes state changes explicit and observable.

Current implementation: [`src/graph-application/GraphStore.ts`](../../src/graph-application/GraphStore.ts)

Selection state is connected to the live engine. The store can now also be initialized from a `GraphSnapshot`, return detached snapshots, and atomically apply a [GraphChangeSet](GraphChangeSet.md). Those snapshot collections are tested but are not connected to live execution yet.

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

## Current API

```ts
class GraphStore {
  getSelectedNodeIds(): readonly NodeInstanceId[];
  getSelectedNodeCount(): number;
  isNodeSelected(nodeId: NodeInstanceId): boolean;
  selectOnly(nodeId: NodeInstanceId): boolean;
  toggleSelection(nodeId: NodeInstanceId): boolean;
  replaceSelection(nodeIds: Iterable<NodeInstanceId>): boolean;
  clearSelection(): boolean;
  getSnapshot(): GraphSnapshot;
  applyChangeSet(changeSet: GraphChangeSet): GraphChangeSetApplyResult;
}
```

`GraphSnapshot` and all collections returned from the store are read-only.

## Atomic application

`applyChangeSet` builds replacement maps for notes, nodes, edges, badges, expansions, and lenses before changing store state. It validates:

- Duplicate and conflicting upsert/removal IDs.
- Note references from nodes and expansions.
- Node references from edges, badges, expansions, and lenses.
- Edge ownership references from expansions.
- Badge-to-expansion and nested expansion references.
- Cycles in nested expansion ownership.

A failed validation returns a structured reason and leaves every collection and selection unchanged. A successful validation swaps all replacement maps synchronously.

The live engine still owns these six collections during migration. We will connect the store only when the complete expand and collapse behavior is available, avoiding synchronized mutable copies.

## Connections

- Mutated by [GraphController](GraphController.md).
- Read through [GraphQueries](GraphQueries.md).
- Applies transitions created by [GraphExpansionTransitionService](GraphExpansionTransitionService.md).
- Snapshots are consumed by [GraphRenderer](GraphRenderer.md) and [PhysicsEngine](PhysicsEngine.md).
- Serialized into [GraphDocument](GraphDocument.md) runtime state.

## Migration rule

Move one state category at a time. Once state moves into this store, delete its old duplicate owner rather than synchronizing two mutable copies.
