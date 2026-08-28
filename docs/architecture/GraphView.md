# GraphView

## Purpose

`GraphView` connects an Obsidian pane to one graph runtime. It owns lifecycle and composition, not graph rules.

## Responsibilities

- Open, hydrate, resize, focus, and close a graph view.
- Construct the [GraphController](GraphController.md), [GraphStore](GraphStore.md), [GraphRenderer](GraphRenderer.md), and [PhysicsEngine](PhysicsEngine.md).
- Load a [GraphDocument](GraphDocument.md) through the [Obsidian adapters](ObsidianAdapters.md).
- Subscribe to store changes and request rendering.
- Block unsafe writes during startup, hydration, and shutdown.

## Proposed API

```ts
class GraphView {
  open(documentPath: string): Promise<void>;
  reload(): Promise<void>;
  resize(width: number, height: number): void;
  focus(): void;
  close(): Promise<void>;
}
```

## Must not own

- YAML parsing or writing
- Relationship discovery
- Badge expansion rules
- Force calculations
- Mutable node and edge collections

## Current migration point

The active `src/GraphView.ts` combines lifecycle, hydration, metadata handling, persistence, and graph orchestration. These responsibilities will be delegated without changing its Obsidian `FileView` contract.

