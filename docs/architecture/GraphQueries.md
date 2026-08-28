# GraphQueries

## Purpose

`GraphQueries` provides the approachable, read-only API for understanding and extending the graph.

Current implementation: [`src/graph-application/GraphQueries.ts`](../../src/graph-application/GraphQueries.ts)

## Proposed API

```ts
class GraphQueries {
  getAllNodeInstances(): readonly GraphNodeInstance[];
  getVisibleNodeInstances(contextId?: GraphContextId): readonly GraphNodeInstance[];
  getUniqueVisibleNotes(contextId?: GraphContextId): readonly GraphNote[];
  getNodeInstancesForNote(noteId: NoteId): readonly GraphNodeInstance[];
  getSelectedNodes(): readonly GraphNodeInstance[];
  getRootNodes(): readonly GraphNodeInstance[];
  getBadgesForNode(nodeId: NodeInstanceId): readonly GraphBadge[];
  getNodesForBadge(nodeId: NodeInstanceId, linkTypeId: LinkTypeId): readonly GraphNodeInstance[];
  getNodesForExpansion(expansionId: ExpansionId): readonly GraphNodeInstance[];
  getLensNodes(lensId: LensId): readonly GraphNodeInstance[];
}
```

## Connections

- Reads [GraphStore](GraphStore.md) snapshots.
- Resolves note data through the [GraphNote](GraphNote.md) repository contract.
- Is used by [GraphController](GraphController.md), UI features, debugging tools, and tests.

## Design rule

Queries answer questions and never change state. A badge click is therefore a controller command; asking which nodes belong to its expansion is a query.
