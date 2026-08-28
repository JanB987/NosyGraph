# Obsidian Adapters

## Purpose

Obsidian adapters are the only layer that knows about `App`, `TFile`, `metadataCache`, `vault`, `fileManager`, and workspace leaves.

One general-purpose gateway would become too large, so the boundary is divided by responsibility.

## Adapters

### ObsidianNoteRepository

Implements the [GraphNote](GraphNote.md) repository and relationship lookup contracts.

```ts
getNote(id): Promise<GraphNote | undefined>;
getAllNotes(): Promise<readonly GraphNote[]>;
getOutgoingLinks(noteId, property): Promise<readonly NoteId[]>;
getIncomingLinks(noteId, property): Promise<readonly NoteId[]>;
```

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

