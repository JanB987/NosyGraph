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
createGraphCollapseChangeSet(plan, snapshot): GraphCollapseChangeSetResult;
```

[GraphExpansionChangeSet](GraphExpansionChangeSet.md) creates atomic expansion output, while [GraphCollapseChangeSet](GraphCollapseChangeSet.md) calculates descendant-aware collapse output.

## Connections

- Triggered through [GraphBadge](GraphBadge.md).
- Initially described by [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Created atomically through [GraphExpansionChangeSet](GraphExpansionChangeSet.md).
- Removed atomically through [GraphCollapseChangeSet](GraphCollapseChangeSet.md).
- Orchestrated by [GraphController](GraphController.md).
- Stored in [GraphStore](GraphStore.md).
- Queried through [GraphQueries](GraphQueries.md).
- Read from the current engine through [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md), including stable owned-edge identities.
