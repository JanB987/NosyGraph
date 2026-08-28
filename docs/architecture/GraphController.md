# GraphController

## Purpose

`GraphController` is the application coordinator. It translates interaction or host intents into domain operations and applies their results to [GraphStore](GraphStore.md).

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
  initialize(document: GraphDocument): Promise<void>;
  execute(command: GraphCommand): Promise<GraphChangeSet>;
  handleIntent(intent: GraphIntent): Promise<void>;
}
```

Smaller typed command methods can wrap `execute` while the architecture is introduced.

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

