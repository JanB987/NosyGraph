# GraphDocument

## Purpose

`GraphDocument` is the host-neutral representation of a graph note. It separates graph configuration from persisted runtime state.

## Proposed shape

```ts
interface GraphDocument {
  id: GraphDocumentId;
  path: string;
  configuration: GraphConfiguration;
  runtime: PersistedGraphRuntime;
}
```

Configuration includes roots, active link types, visible link types, groups, filters, and simulation settings. Runtime includes visible node instances, positions, pins, expansions, lenses, viewport, and UI state.

## Source-of-truth rule

- Regular note frontmatter owns relationships.
- [GraphStore](GraphStore.md) owns the current runtime.
- `GraphDocument.runtime` is a persisted snapshot of that runtime.

## Functions

```ts
hydrateGraphStore(document, noteIndex): GraphSnapshot;
serializeGraphStore(snapshot): PersistedGraphRuntime;
reconcileWithNoteTruth(snapshot, noteIndex): GraphChangeSet;
```

## Connections

[GraphView](GraphView.md) loads it, [GraphController](GraphController.md) reconciles it, and the [Obsidian graph-document adapter](ObsidianAdapters.md) reads and writes it.

