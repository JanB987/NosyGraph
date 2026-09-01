# GraphQueries

## Purpose

`GraphQueries` provides the approachable, read-only API for understanding and extending the graph.

Current implementation: [`src/graph-application/GraphQueries.ts`](../../src/graph-application/GraphQueries.ts)

The active legacy engine currently connects through [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md). `GraphEngine.getArchitectureQueries()` is the temporary public entry point. The adapter copies legacy state; it does not take ownership or change graph behavior.

## Current API

```ts
class GraphQueries {
  getSnapshot(): GraphSnapshot;
  getAllNodeInstances(): readonly GraphNodeInstance[];
  getNodeInstance(nodeId: NodeInstanceId): GraphNodeInstance | undefined;
  getVisibleNodeInstances(contextId?: GraphContextId): readonly GraphNodeInstance[];
  getUniqueVisibleNotes(contextId?: GraphContextId): readonly GraphNote[];
  getNote(noteId: NoteId): GraphNote | undefined;
  getNodeInstancesForNote(noteId: NoteId): readonly GraphNodeInstance[];
  getSelectedNodes(): readonly GraphNodeInstance[];
  getRootNodes(): readonly GraphNodeInstance[];
  getBadges(): readonly GraphBadge[];
  getBadge(badgeId: BadgeId): GraphBadge | undefined;
  getBadgesForNode(nodeId: NodeInstanceId): readonly GraphBadge[];
  getNodesForBadge(nodeId: NodeInstanceId, linkTypeId: LinkTypeId): readonly GraphNodeInstance[];
  getNodesForExpansion(expansionId: ExpansionId): readonly GraphNodeInstance[];
  getEdges(): readonly GraphEdge[];
  getEdgesForNode(nodeId: NodeInstanceId): readonly GraphEdge[];
  getLenses(): readonly GraphLens[];
  getLens(lensId: LensId): GraphLens | undefined;
  getLensNodes(lensId: LensId): readonly GraphNodeInstance[];
}
```

## Connections

- Reads [GraphStore](GraphStore.md) snapshots.
- Resolves note data through the [GraphNote](GraphNote.md) repository contract.
- Supplies existing entities to [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md).
- Is used by [GraphController](GraphController.md), UI features, debugging tools, and tests.

## Design rule

Queries answer questions and never change state. A badge click is therefore a controller command; asking which nodes belong to its expansion is a query.

`getSnapshot` supports calculations that must evaluate several ownership collections consistently, such as [GraphCollapseChangeSet](GraphCollapseChangeSet.md). The returned snapshot remains read-only and detached by its source adapter or store.

`GraphController` uses `getBadge` and `getNodeInstance` together to build a host-neutral [GraphBadgeRequest](GraphBadgeRequest.md).
