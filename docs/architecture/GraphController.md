# GraphController

## Purpose

`GraphController` is the application command boundary. It translates renderer and host intents into serializable commands, applies selection to [GraphStore](GraphStore.md), and delegates host-owned behavior through narrow ports.

Current implementation: [`src/graph-application/GraphController.ts`](../../src/graph-application/GraphController.ts)

Selection and normal badge routing are live bridges. Pinning, dragging, root membership, and relationship refresh now have complete command vocabulary and explicit ports, while the legacy engine remains the runtime owner of those mutations.

## Command flow

```text
GraphView or GraphRenderer intent
              |
              v
       GraphController
       /      |       \
 GraphStore  queries  host ports
 selection   resolve  pin/drag/root/refresh
```

The controller never receives DOM handles, `TFile` objects, or mutable legacy nodes. Commands carry stable node, badge, and path identifiers. Ports select the appropriate host operation and persistence policy.

## Command families

### Selection

```ts
executeSelection(command: GraphSelectionCommand): GraphSelectionResult;
```

Selection commands are `select-only`, `toggle-selection`, `replace-selection`, `select-all`, and `clear-selection`. The store owns the selected ID set and the result contains a detached list for rendering.

### Normal badges

```ts
executeBadge(command: GraphBadgeCommand): Promise<GraphBadgeCommandResult>;
```

The controller resolves the stable badge ID and its node through [GraphQueries](GraphQueries.md), then creates a serializable [GraphBadgeRequest](GraphBadgeRequest.md). It passes that request to `GraphBadgeCommandPort`, currently implemented by [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md). Unknown badges, missing nodes, and unavailable ports return explicit unhandled results.

### Pinning

```ts
executePin(command: GraphPinCommand): Promise<GraphPinCommandResult>;
```

`pin-node` and `unpin-node` carry a node ID and optional position, persistence, or simulation restart flags. `GraphPinCommandPort` owns fixed coordinates, pin icons, and persistence in the current runtime.

### Dragging

```ts
executeDrag(command: GraphDragCommand): Promise<GraphDragCommandResult>;
```

Dragging is a lifecycle: `begin-drag`, `move-drag`, `end-drag`, and `cancel-drag`. This keeps grouped selection, pinned repositioning, and commit or rollback behavior in the host adapter. The controller validates finite positions and resolves the node when queries are available.

### Root membership

```ts
executeRoot(command: GraphRootCommand): Promise<GraphRootCommandResult>;
```

`set-roots`, `add-root`, and `remove-root` carry stable node IDs. `GraphRootCommandPort` owns link resolution, graph-note frontmatter or view-state persistence, and rebuilding the visible graph.

### Relationship refresh

```ts
executeRelationshipRefresh(
  command: GraphRelationshipRefreshCommand
): Promise<GraphRelationshipRefreshCommandResult>;
```

A refresh identifies a trimmed source path, changed property names, and an optional scope: `outer`, `embedded`, `visible`, `embedded-visible`, or `all`. `GraphRelationshipRefreshCommandPort` maps that request to the corresponding legacy refresh operations.

## Port and migration boundary

The ports are temporary host adapters. They make the command contract testable without importing Obsidian or DOM types and let each legacy operation move behind a replacement implementation independently. A missing port is reported as an unhandled result; the controller never silently mutates legacy collections as a fallback.

The active engine still interprets pointer events and owns live pin, drag, root, and relationship state. Production composition has not yet selected store-owned implementations for those families.

## Connections

- Reads detached state through [GraphQueries](GraphQueries.md).
- Changes selection through [GraphStore](GraphStore.md).
- Receives intents from [GraphRenderer](GraphRenderer.md).
- Delegates host behavior through [Obsidian adapters](ObsidianAdapters.md).

## Must not own

- Canvas or DOM elements
- Obsidian `TFile` objects
- Physics state
- Independent node or edge collections
