# GraphBadgeToggleHandler

## Purpose

`GraphBadgeToggleHandler` is the single application operation that joins normal badge planning and execution.

Current implementation: [`src/graph-application/GraphBadgeToggleHandler.ts`](../../src/graph-application/GraphBadgeToggleHandler.ts)

## API

```ts
class GraphBadgeToggleHandler {
  handle(request: GraphBadgeRequest): Promise<GraphBadgeToggleHandlerResult>;
}
```

The handler depends on two small interfaces:

```ts
GraphBadgeTogglePlanner;
GraphBadgeToggleExecutor;
```

[GraphBadgeToggleService](GraphBadgeToggleService.md) implements the planner. [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md) is the temporary executor.

## Flow

```text
GraphBadgeRequest
       |
       v
GraphBadgeToggleHandler
       |
       +----> GraphBadgeTogglePlanner
       |              |
       |              v
       |       GraphBadgeTogglePlan
       |              |
       +--------------+
                      v
             GraphBadgeToggleExecutor
                      |
                      v
       applied / unchanged / rejected
```

An unavailable planning result bypasses the executor and becomes a unified `status: "unavailable"` handler result.

## Responsibilities

- Request one plan.
- Stop if live state is unavailable or outdated.
- Pass the exact plan to the executor.
- Return the executor outcome unchanged.

## Must not own

- Relationship lookup
- Expand/collapse decisions
- Legacy-object resolution
- Graph mutation
- UI behavior

## Current migration state

The complete normal-toggle application path is now testable without `GraphEngine`, but it is not connected to live clicks. Production still uses [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md).

The next integration step will construct the planner, relationship adapter, and legacy executor in `GraphEngine`, then route only normal `toggle-badge` requests through this handler. Parent, input, and chain behavior will remain on their current paths.
