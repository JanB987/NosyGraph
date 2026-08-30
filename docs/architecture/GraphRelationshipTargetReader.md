# GraphRelationshipTargetReader

## Purpose

`GraphRelationshipTargetReader` is the host-neutral boundary for asking which notes a link type connects to a source note.

Current implementation: [`src/graph-application/GraphRelationshipTargetReader.ts`](../../src/graph-application/GraphRelationshipTargetReader.ts)

## API

```ts
interface GraphRelationshipTargetReader {
  readTargets(query: {
    sourceNoteId: NoteId;
    linkTypeId: LinkTypeId;
    contextId: GraphContextId;
  }): Promise<readonly GraphRelationshipTarget[]>;
}
```

Each result contains:

```ts
interface GraphRelationshipTarget {
  noteId: NoteId;
  label: string;
  missing: boolean;
}
```

Missing notes are intentional results. NosyGraph currently displays unresolved internal links as graph nodes, so filtering them out at this boundary would change behavior.

## Why this is note-level

Relationship data belongs to Markdown notes. Runtime node identity, duplicate-node placement, and expansion ownership are handled later by [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md) and the executor.

`contextId` selects the correct link-type configuration for outer or embedded graphs. The query does not carry discovery direction or property aliases; those remain configuration details resolved behind this interface.

## Responsibilities

- Resolve outgoing, incoming, or bidirectional relationships according to link-type configuration.
- Combine configured property aliases.
- Return canonical note identities.
- Preserve unresolved internal-note targets.
- Exclude self-links and duplicate targets.

## Connections

- Receives note and link-type identities from [GraphBadgeRequest](GraphBadgeRequest.md).
- Supplies targets to [GraphBadgeToggleService](GraphBadgeToggleService.md), which passes their note IDs to [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Will be implemented by an [Obsidian adapter](ObsidianAdapters.md).
- Currently has a temporary [LegacyGraphRelationshipTargetAdapter](LegacyGraphRelationshipTargetAdapter.md).

## Must not own

- Graph nodes or expansion ownership
- Node placement or physics
- Canvas or DOM state
- Badge expanded/collapsed state
