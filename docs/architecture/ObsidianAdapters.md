# Obsidian Adapters

## Purpose

Obsidian adapters are the only layer that knows about `App`, `TFile`, `metadataCache`, `vault`, `fileManager`, and workspace leaves.

One general-purpose gateway would become too large, so the boundary is divided by responsibility.

## Adapters

### ObsidianNoteRepository

Implements the [GraphNote](GraphNote.md) repository contract.

```ts
getNote(id): Promise<GraphNote | undefined>;
getAllNotes(): Promise<readonly GraphNote[]>;
getOutgoingLinks(noteId, property): Promise<readonly NoteId[]>;
getIncomingLinks(noteId, property): Promise<readonly NoteId[]>;
```

### ObsidianRelationshipTargetReader

Implements [GraphRelationshipTargetReader](GraphRelationshipTargetReader.md). It combines outgoing and incoming links according to link-type configuration, resolves property aliases, and preserves missing internal-note targets.

During migration, [LegacyGraphRelationshipTargetAdapter](LegacyGraphRelationshipTargetAdapter.md) wraps the existing resolver instead.

[ObsidianGraphExpansionNoteAdapter](ObsidianGraphExpansionNoteAdapter.md) is the first concrete read adapter for the new expansion pipeline. It converts vault files, cached frontmatter, and unresolved paths into `GraphNote` values without exposing Obsidian objects to the materializer.

### ObsidianNoteWriter

```ts
addRelationship(command): Promise<void>;
removeRelationship(command): Promise<void>;
updateFrontmatter(path, changes): Promise<void>;
```

### ObsidianGraphWatcher

Emits normalized note-created, changed, renamed, deleted, and active-note-changed events.

### ObsidianNavigationAdapter

Opens notes, reveals files, and emits Obsidian-compatible hover previews.

### ObsidianGraphDocumentRepository

Loads and saves [GraphDocument](GraphDocument.md) configuration and runtime state.

## Connections

[GraphView](GraphView.md) owns adapter lifecycles. [GraphController](GraphController.md) uses their host-neutral interfaces. No domain class imports Obsidian.
