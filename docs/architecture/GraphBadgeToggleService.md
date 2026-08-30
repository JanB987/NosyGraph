# GraphBadgeToggleService

## Purpose

`GraphBadgeToggleService` coordinates the read-only work needed to produce a complete normal badge expand/collapse plan.

Current implementation: [`src/graph-application/GraphBadgeToggleService.ts`](../../src/graph-application/GraphBadgeToggleService.ts)

It composes existing boundaries rather than knowing about Obsidian or legacy runtime objects.

## API

```ts
class GraphBadgeToggleService {
  plan(request: GraphBadgeRequest): Promise<GraphBadgeToggleServiceResult>;
}
```

The class implements `GraphBadgeTogglePlanner`, allowing [GraphBadgeToggleHandler](GraphBadgeToggleHandler.md) to depend on the small planning contract rather than the concrete service.

The result is an `expand`, `collapse`, or `unsupported` [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md), or:

```ts
interface GraphBadgeToggleUnavailable {
  kind: "unavailable";
  badgeId: BadgeId;
  reason: "badge-not-found" | "node-not-found" | "request-outdated";
}
```

## Flow

```text
GraphBadgeRequest
       |
       v
GraphBadgeToggleService -----> GraphQueries
       |
       +---------------------> GraphRelationshipTargetReader
       |
       v
planGraphBadgeToggle
       |
       v
GraphBadgeTogglePlan
       |
       v
GraphBadgeToggleExecutor
```

## Behavior

1. Resolve the current badge and node from [GraphQueries](GraphQueries.md).
2. Reject a request if its node, note, link type, context, or semantic no longer matches live state.
3. Return unsupported plans for parent badges and non-toggle actions without reading relationships.
4. Return collapse plans without reading relationships.
5. For a collapsed normal badge, read targets through [GraphRelationshipTargetReader](GraphRelationshipTargetReader.md).
6. Derive nested ownership from a source node whose origin is another badge expansion.
7. Pass the complete input to [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).

## Why collapse skips relationship reading

Collapse operates on expansion ownership already present in graph state. Reading current note relationships would be unnecessary and could produce different targets from those originally expanded.

## Current migration state

The service is fully host-neutral and tested. [GraphBadgeToggleHandler](GraphBadgeToggleHandler.md) composes it with [GraphBadgeToggleExecutor](GraphBadgeToggleExecutor.md), and live normal link-badge toggles now use this path. Other badge actions still delegate through [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md).

## Must not own

- Graph mutation or persistence
- Obsidian files and metadata
- Node construction or placement
- Expansion subtree deletion
- Rendering or physics
