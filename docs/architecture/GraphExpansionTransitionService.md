# GraphExpansionTransitionService

## Purpose

`GraphExpansionTransitionService` creates the complete atomic state transition for one validated badge expansion.

Current implementation: [`src/graph-application/GraphExpansionTransitionService.ts`](../../src/graph-application/GraphExpansionTransitionService.ts)

It is an application service: it coordinates existing components but does not read Obsidian directly, mutate [GraphStore](GraphStore.md), redraw, or run physics.

## Flow

```text
GraphBadgeExpandPlan
        |
        v
current badge and parent lookup
        |
        v
GraphExpansionTargetMaterializer
        |
        v
refresh current badge and parent
        |
        v
createGraphExpansionChangeSet
        |
        v
GraphChangeSet
```

Refreshing state after materialization matters because note reads are asynchronous. If another action expands the badge while a note is being read, the service reports a stale change instead of calculating from the old badge.

## Result stages

Failures retain the stage that produced them:

- `state`: the badge or required parent expansion is absent.
- `materialization`: target notes or graph entities could not be prepared.
- `change-set`: prepared entities no longer agree with current graph state.

This makes logs and tests more informative without throwing for expected stale-state conditions.

## Connections

- Consumes the `expand` branch of [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Reads current state through [GraphQueries](GraphQueries.md).
- Delegates entity preparation to [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md).
- Delegates atomic calculation to [GraphExpansionChangeSet](GraphExpansionChangeSet.md).
- Produces changes accepted by the atomic [GraphStore](GraphStore.md) application method.
