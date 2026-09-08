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


## C6 implementation boundary

The adapter contracts are now implemented and tested independently of the legacy view:

- `ObsidianNoteRepository<TFile>` converts injected vault and metadata-cache reads into detached `GraphNote` values and canonical outgoing/incoming link IDs. Unresolved outgoing candidates remain visible as missing targets.
- `ObsidianRelationshipTargetReader` resolves link-type property and direction configuration through the repository and preserves missing target labels.
- `ObsidianNoteWriter<TFile>` owns relationship add/remove and case-insensitive frontmatter updates through one `processFrontMatter` gateway.
- `ObsidianNavigationAdapter` owns note opening, file reveal, and hover preview requests, with explicit missing-target and unavailable-host results.
- `ObsidianGraphWatcher` maps vault, metadata-cache, and workspace registrations into normalized create, change, rename, delete, and active-note-changed events and releases registrations when no subscribers remain.

The implementations use injected host gateways so tests do not construct Obsidian objects. `GraphController` exposes note-write and navigation command boundaries; GraphView can adopt these ports incrementally while the legacy calls remain the live runtime owner.


### ObsidianGraphDocumentRepository

C7 adds `ObsidianGraphDocumentRepository`, backed by an injected storage gateway. It saves and loads the versioned `GraphDocument` JSON and restores committed state directly through `GraphDocumentPersistence`.
