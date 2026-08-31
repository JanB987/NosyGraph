# ObsidianGraphExpansionNoteAdapter

## Purpose

`ObsidianGraphExpansionNoteAdapter` implements the narrow `GraphExpansionNoteReader` port used by [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md).

Current implementation: [`src/graph-application/ObsidianGraphExpansionNoteAdapter.ts`](../../src/graph-application/ObsidianGraphExpansionNoteAdapter.ts)

The adapter receives small callbacks rather than importing the Obsidian API into domain logic. The current engine owned by [GraphView](GraphView.md) supplies those callbacks from the vault and metadata cache during the migration.

## Conversion

For an existing vault file it creates a [GraphNote](GraphNote.md) containing:

- Stable path identity and display name.
- An `available` marker.
- A copied frontmatter property record.
- Optional configured node size and icon values.

For an unresolved path it creates a `missing` note with an inferred filename. Missing wiki-link targets can therefore remain explicit graph entities instead of being silently discarded.

An empty identity or an existing file without a usable path returns `undefined`, allowing materialization to reject invalid input explicitly.

## Connections

- Implements `GraphExpansionNoteReader` from [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md).
- Reads host data supplied by [Obsidian adapters](ObsidianAdapters.md).
- Is used by [GraphBadgeToggleShadowService](GraphBadgeToggleShadowService.md).
- Does not mutate notes, metadata, graph state, or UI state.
