# GraphView

## Purpose

`GraphView` connects an Obsidian pane to one graph runtime. It owns lifecycle and composition, not graph rules.

## Target responsibilities

In store mode, the view is the composition root:

- Open, hydrate, resize, focus, and close a graph view.
- Construct the [GraphController](GraphController.md), [GraphStore](GraphStore.md), [GraphRenderer](GraphRenderer.md), and a replaceable [PhysicsEngine](GraphPhysicsEngine.md).
- Load a [GraphDocument](GraphDocument.md) through the [Obsidian adapters](ObsidianAdapters.md).
- Subscribe to store changes and request rendering.
- Block unsafe writes during startup, hydration, and shutdown.

The controller routes renderer and host intents. The view does not interpret badge, relationship, or force rules.

## Current live implementation

The production Obsidian path has not selected store mode. `src/GraphView.ts` still constructs `GraphEngine` directly and keeps the legacy engine as its runtime owner. It combines lifecycle, hydration, metadata handling, persistence, pointer routing, and graph orchestration. `StoreGraphRuntime` implements the target composition behind an explicit guarded mode, but it remains experimental until the activation gates are complete.

This is an intentional migration boundary: the architecture audit records the target composition and the live composition separately so a detached implementation is not mistaken for a production cutover.

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

## Migration boundary

When store mode becomes live, GraphView will construct the runtime and forward lifecycle events. Until then, legacy `GraphEngine` ownership remains required by supported interactions and parity diagnostics. See [Architecture audit](ArchitectureAudit.md) and [Legacy ownership audit](LegacyOwnershipAudit.md).
