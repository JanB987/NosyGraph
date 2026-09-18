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

`GraphEngine` now composes the Obsidian note repository, relationship reader, planning service, legacy executor, and this handler. Live `toggle-badge` requests with `semantic: "link"` use this path.

Parent toggles, Alt-click link input, and Ctrl/Cmd-click chain expansion remain on [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md). This limits the first production integration to the normal expand/collapse behavior covered by the planner and executor.
