# GraphDocument

## Purpose

`GraphDocument` is the host-neutral representation of a graph note. It separates graph configuration from persisted runtime state.

## Shape

```ts
interface GraphDocument {
  id: GraphDocumentId;
  path: string;
  configuration: GraphDocumentConfiguration;
  runtime: PersistedGraphRuntime;
}
```

Configuration values are host-neutral and detached. Runtime includes the validated graph snapshot, scene ownership records, node positions and pins, expansions, lenses, layout ID, and viewport.

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



## C7 implementation

`GraphDocumentPersistence` serializes one committed detached runtime snapshot containing:

- stable note, node, edge, badge, expansion, and lens identities;
- expansion ownership arrays and child expansion relationships;
- scene-owned lenses, groups, and containers;
- node coordinates, pin/selection state, layout ID, and viewport;
- host-neutral configuration values.

`ObsidianGraphDocumentRepository` supplies the storage read/write gateway. Restoration validates the snapshot and scene first, then constructs `GraphStore` and `GraphSceneStore` directly. It does not replay badge toggles or rebuild ownership from UI actions.
