# GraphController

## Purpose

`GraphController` is the application coordinator. It translates interaction or host intents into domain operations and applies their results to [GraphStore](GraphStore.md).

Current implementation: [`src/graph-application/GraphController.ts`](../../src/graph-application/GraphController.ts)

Selection is the first implemented command family. Other responsibilities below describe the target architecture and will be introduced incrementally.

## Current selection flow

```text
GraphEngine interprets pointer or keyboard input
                       |
                       v
               GraphController
                       |
                       v
                  GraphStore
                       |
                       v
GraphSelectionResult tells GraphEngine whether to redraw
```

The active engine performs no direct selection mutation. It still owns input interpretation and selection-related drawing during this migration stage.

## Responsibilities

- Add and remove roots.
- Select, move, pin, and unpin nodes.
- Expand and collapse [GraphBadge](GraphBadge.md) instances.
- Add or remove note relationships through [Obsidian adapters](ObsidianAdapters.md).
- Open and close [GraphLens](GraphLens.md) instances.
- Apply atomic `GraphChangeSet` results.

## Proposed API

```ts
class GraphController {
  executeSelection(command: GraphSelectionCommand): GraphSelectionResult;
  selectOnly(nodeId: NodeInstanceId): GraphSelectionResult;
  toggleSelection(nodeId: NodeInstanceId): GraphSelectionResult;
  replaceSelection(nodeIds: readonly NodeInstanceId[]): GraphSelectionResult;
  selectAll(nodeIds: readonly NodeInstanceId[]): GraphSelectionResult;
  clearSelection(): GraphSelectionResult;
}
```

Each result reports whether state changed and returns a detached selection list. The active view can therefore decide whether badges and rendering need refresh without the controller importing DOM or renderer code.

Future command families will add initialization, roots, expansions, relationships, and lenses. A broader `execute(command)` entry point should be added only when more than one family needs common dispatch.

## Connections

- Reads host information through [Obsidian adapters](ObsidianAdapters.md).
- Changes runtime state through [GraphStore](GraphStore.md).
- Uses [GraphQueries](GraphQueries.md) to inspect current state.
- Receives intents from [GraphRenderer](GraphRenderer.md).

## Must not own

- Canvas or DOM elements
- Obsidian `TFile` objects
- Physics state
- Independent node or edge collections
