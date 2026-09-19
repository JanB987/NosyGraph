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
- Persist embedded lens runtime through the embedded graph note. A persistent parent graph may initialize an `o3graph` block for a graph-capable lens note on its first badge expansion; ephemeral parent views remain runtime-only.

The controller routes renderer and host intents. Badge planning and Obsidian relationship reads are application and adapter responsibilities; the view does not interpret those rules.

## Current live implementation

The production Obsidian path has not selected store mode. `src/GraphView.ts` still constructs `GraphEngine` directly and keeps the legacy engine as its runtime owner. It combines lifecycle, hydration, metadata handling, persistence, pointer routing, and graph orchestration. `StoreGraphRuntime` implements the target composition behind an explicit guarded mode, but it remains experimental until the activation gates are complete.

## Metadata changes

`GraphView` treats an ordinary note metadata event as a file-scoped update. The metadata-cache and vault events are debounced by path, the changed file's cached frontmatter and links are refreshed, and `handleGraphEvent` updates the visible runtime instances for that source path. Active badge expansions, outer visible-link edges, embedded visible-link edges, grouping metadata, and badge presence are refreshed from that source; unrelated notes are not reread or used to rebuild the visible-link context. Incremental canonical-edge replacement preserves visible and overlay edges, whose refresh ownership is separate, so an unrelated grouping/status change cannot drop those connections.

Graph-note frontmatter, LinkType definitions, active group definitions, and connected Base filters remain configuration changes. Those changes can affect many nodes and therefore retain their broader reload/rebuild paths. This boundary is recorded in [Use Case - Refresh graph after note metadata change](../../../../../../PRJT%20-%20Graph%20Plugin%20V2/Use%20Case%20-%20Refresh%20graph%20after%20note%20metadata%20change.md).

The live view first loads the configured LinkType registry folder, then asks `LinkTypeRegistry` to load valid LinkType files referenced explicitly by the graph note. This keeps folder-based discovery scoped while ensuring that `activeLinkTypes`, `activeOverlayLinkTypes`, and `visibleLinkTypes` remain authoritative across plugin installation or a missing/stale settings file. Embedded graph definitions use the same referenced-definition path.

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
