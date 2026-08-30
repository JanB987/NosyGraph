# GraphBadgeTogglePlan

## Purpose

`GraphBadgeTogglePlan` describes whether a normal link badge should expand or collapse, without reading Obsidian or mutating graph state.

Current implementation: [`src/graph-application/GraphBadgeTogglePlan.ts`](../../src/graph-application/GraphBadgeTogglePlan.ts)

This is deliberately a planning boundary, not yet an executor. It records the stable behavior we observed in the legacy engine before that behavior is moved.

## Input

```ts
interface GraphBadgeToggleInput {
  request: GraphBadgeRequest;
  badgeState: "collapsed" | "expanded";
  targetNoteIds: readonly NoteId[];
  parentExpansionId: ExpansionId | null;
}
```

- [GraphBadgeRequest](GraphBadgeRequest.md) supplies node, note, link-type, and context identity.
- `badgeState` determines expand versus collapse.
- `targetNoteIds` come from [GraphRelationshipTargetReader](GraphRelationshipTargetReader.md).
- `parentExpansionId` preserves nested expansion ownership.

## Results

The pure `planGraphBadgeToggle(input)` function returns one of:

- `expand`, including unique target note IDs and the parent expansion.
- `collapse`, identifying the expansion whose subtree must be removed.
- `unsupported`, keeping parent badges and non-toggle actions outside this normal-link planner.

The expansion ID remains equal to the stable badge ID, matching current runtime behavior.

## Characterized legacy behavior

The current outer-graph toggle path establishes these rules:

1. Clicking a collapsed normal badge creates an expansion even when it resolves no targets.
2. Duplicate resolved targets are owned only once by that expansion.
3. Clicking an expanded badge collapses the full descendant expansion subtree, deepest first.
4. A node remains visible while a root or another expansion still owns it.
5. Expanding or collapsing reconciles visible files and rebuilds graph edges.
6. A persisted toggle event is emitted only after a state change.

The planner currently encodes rules 1, 2, and the root decision for rule 3. Rules 3-6 belong to the future executor and change-set application work.

## Why parent badges are excluded

Parent badges currently invoke a separate host callback and have different relationship semantics. Treating them as normal link expansions now would hide an important behavioral distinction. They continue through [GraphController](GraphController.md), but not through this planner.

## Connections

- Consumes [GraphBadgeRequest](GraphBadgeRequest.md).
- Receives targets from [GraphRelationshipTargetReader](GraphRelationshipTargetReader.md).
- Produces the decision needed to create or remove a [GraphExpansion](GraphExpansion.md).
- Will be orchestrated by [GraphController](GraphController.md).
- Will eventually produce changes applied to [GraphStore](GraphStore.md).
