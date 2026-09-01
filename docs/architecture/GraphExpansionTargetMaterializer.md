# GraphExpansionTargetMaterializer

## Purpose

`GraphExpansionTargetMaterializer` turns the note IDs in an expansion plan into complete `GraphNote`, `GraphNodeInstance`, and `GraphEdge` entities without changing graph state.

Current implementation: [`src/graph-application/GraphExpansionTargetMaterializer.ts`](../../src/graph-application/GraphExpansionTargetMaterializer.ts)

The materializer fills the gap between deciding *what* a badge should expand and describing the atomic state change.

## Collaborators

```ts
interface GraphExpansionNoteReader {
  readNote(noteId: NoteId): Promise<GraphNote | undefined>;
}

interface GraphExpansionBadgeReader {
  readBadges(input: GraphExpansionBadgeReadInput): Promise<readonly GraphBadge[]>;
}

interface GraphExpansionNodePlacer {
  place(input: GraphExpansionNodePlacementInput): GraphPoint;
}

interface GraphExpansionTargetMaterializer {
  materialize(plan, badge): Promise<GraphExpansionTargetMaterializationResult>;
}
```

- `GraphQueries` supplies existing notes, nodes, and edges.
- `GraphExpansionNoteReader` is the narrow gateway for a note not already in the graph snapshot. [ObsidianGraphExpansionNoteAdapter](ObsidianGraphExpansionNoteAdapter.md) translates files and unresolved links into host-neutral `GraphNote` objects.
- `GraphExpansionBadgeReader` supplies configured badges for a newly created node. [LegacyGraphExpansionBadgeAdapter](LegacyGraphExpansionBadgeAdapter.md) currently translates active LinkType definitions into those records.
- `GraphExpansionNodePlacer` owns only the initial position calculation. The default radial implementation follows the current golden-angle layout, while a future physics implementation can replace it.

## Reuse and identity rules

1. An existing semantic edge reuses its target node and edge.
2. A normal badge reuses a same-context node for the target note when one exists.
3. A duplicate-node badge creates a stable identity from source node, target note, and link type.
4. Root nodes use the note ID; embedded and other contexts use context-scoped IDs.
5. New edges use the stable `badge-expansion` identity shared with [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md).
6. New nodes receive their configured, initially collapsed badges; reused nodes retain snapshot badges.

Reused entities remain unchanged. Ownership is added later by [GraphExpansionChangeSet](GraphExpansionChangeSet.md), which is why a root node can also be owned by an expansion.

## Failure behavior

The operation returns an explicit failure for a stale badge, missing source node, unavailable target note, a note reader returning the wrong identity, or a badge reader returning records for the wrong node or context. It never returns a partial successful target list.

## Connections

- Consumes an expansion result from [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Reads current state through [GraphQueries](GraphQueries.md).
- Reads note data defined by [GraphNote](GraphNote.md).
- Produces the materialized input for [GraphExpansionChangeSet](GraphExpansionChangeSet.md).
- Is orchestrated by [GraphExpansionTransitionService](GraphExpansionTransitionService.md).
- Delegates initial geometry to the future [PhysicsEngine](PhysicsEngine.md) boundary.
