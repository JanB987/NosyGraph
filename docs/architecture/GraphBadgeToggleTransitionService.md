# GraphBadgeToggleTransitionService

## Purpose

`GraphBadgeToggleTransitionService` is the single host-neutral entry point for calculating a normal badge toggle transition.

Current implementation: [`src/graph-application/GraphBadgeToggleTransitionService.ts`](../../src/graph-application/GraphBadgeToggleTransitionService.ts)

It accepts the existing [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md) union and returns either one ready [GraphChangeSet](GraphChangeSet.md) or a typed branch failure.

## Branching

```text
GraphBadgeTogglePlan
        |
        +-- expand ------> GraphExpansionTransitionService
        |
        +-- collapse ----> createGraphCollapseChangeSet(snapshot)
        |
        +-- unsupported -> reject without reading state
```

Expand remains asynchronous because it may need note data from an adapter. Collapse is a synchronous calculation over one current snapshot.

## Result

A successful result has one common shape:

```ts
{
  ok: true;
  effect: "expand" | "collapse";
  changeSet: GraphChangeSet;
}
```

Failures retain their branch:

- `plan` contains the unsupported plan reason.
- `expand` contains the complete staged expansion failure.
- `collapse` contains the complete collapse-factory failure.

Nesting failures avoids reducing precise domain errors to a generic string.

## Connections

- Consumes [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Delegates expansion to [GraphExpansionTransitionService](GraphExpansionTransitionService.md).
- Delegates collapse to [GraphCollapseChangeSet](GraphCollapseChangeSet.md).
- Reads collapse state through [GraphQueries](GraphQueries.md).
- Produces changes for atomic application by [GraphStore](GraphStore.md).
- Will be used by the store-backed implementation of [GraphBadgeToggleExecutor](GraphBadgeToggleExecutor.md).
