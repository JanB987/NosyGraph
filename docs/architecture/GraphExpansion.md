# GraphExpansion

## Purpose

`GraphExpansion` records which runtime objects are owned through one badge. An expansion may reuse an object that another expansion already owns, so ownership does not necessarily mean creation. Explicit ownership makes collapse and nested duplicate behavior understandable and testable.

Current implementation: [`src/graph-domain/GraphExpansion.ts`](../../src/graph-domain/GraphExpansion.ts)

## Core data

```ts
interface GraphExpansion {
  id: ExpansionId;
  sourceNodeId: NodeInstanceId;
  sourceNoteId: NoteId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  ownedNodeIds: readonly NodeInstanceId[];
  ownedEdgeIds: readonly EdgeId[];
  childExpansionIds: readonly ExpansionId[];
}
```

## Pure operations

```ts
planGraphBadgeToggle(input): GraphBadgeTogglePlan;
resolveExpansionTargets(sourceNoteId, linkType, relationshipIndex): readonly NoteId[];
createGraphExpansionChangeSet(input): GraphExpansionChangeSetResult;
createCollapseChangeSet(expansionId, snapshot): GraphChangeSet;
```

[GraphExpansionChangeSet](GraphExpansionChangeSet.md) now creates the atomic expansion output. The collapse factory remains a later extraction step.

## Connections

- Triggered through [GraphBadge](GraphBadge.md).
- Initially described by [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Created atomically through [GraphExpansionChangeSet](GraphExpansionChangeSet.md).
- Orchestrated by [GraphController](GraphController.md).
- Stored in [GraphStore](GraphStore.md).
- Queried through [GraphQueries](GraphQueries.md).
