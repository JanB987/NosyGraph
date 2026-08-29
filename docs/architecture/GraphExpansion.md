# GraphExpansion

## Purpose

`GraphExpansion` records which runtime objects were introduced through one badge. Explicit ownership makes collapse and nested duplicate behavior understandable and testable.

Current implementation: [`src/graph-domain/GraphExpansion.ts`](../../src/graph-domain/GraphExpansion.ts)

## Core data

```ts
interface GraphExpansion {
  id: ExpansionId;
  sourceNodeId: NodeInstanceId;
  sourceNoteId: NoteId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  createdNodeIds: readonly NodeInstanceId[];
  createdEdgeIds: readonly EdgeId[];
  childExpansionIds: readonly ExpansionId[];
}
```

## Pure operations

```ts
planGraphBadgeToggle(input): GraphBadgeTogglePlan;
resolveExpansionTargets(sourceNoteId, linkType, relationshipIndex): readonly NoteId[];
createExpansionChangeSet(expansion, targetNotes): GraphChangeSet;
createCollapseChangeSet(expansionId, snapshot): GraphChangeSet;
```

## Connections

- Triggered through [GraphBadge](GraphBadge.md).
- Initially described by [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Orchestrated by [GraphController](GraphController.md).
- Stored in [GraphStore](GraphStore.md).
- Queried through [GraphQueries](GraphQueries.md).
