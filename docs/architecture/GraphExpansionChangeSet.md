# GraphExpansionChangeSet

## Purpose

`createGraphExpansionChangeSet` converts a validated expansion plan and already-materialized domain entities into one atomic [GraphChangeSet](GraphChangeSet.md).

Current implementation: [`src/graph-application/GraphExpansionChangeSet.ts`](../../src/graph-application/GraphExpansionChangeSet.ts)

The function is deliberately pure. It does not choose node positions, read Obsidian notes, mutate [GraphStore](GraphStore.md), redraw, or run physics.

## Input

```ts
interface GraphExpansionChangeSetInput {
  plan: GraphBadgeExpandPlan;
  badge: GraphBadge;
  targets: readonly MaterializedGraphExpansionTarget[];
  parentExpansion?: GraphExpansion;
}
```

Each materialized target contains the complete `GraphNote`, `GraphNodeInstance`, and `GraphEdge` that should exist after applying the expansion. The earlier [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md) determines which note IDs must be present and their stable order.

## Output

On success, the change set:

- Upserts target notes, node instances, and edges.
- Changes the clicked badge to `expanded`.
- Creates a `GraphExpansion` with explicit node and edge ownership.
- Preserves a reused node's original origin while adding it to the new expansion's ownership.
- Adds a nested expansion to its parent's `childExpansionIds` in the same transaction.
- Records an expansion even if it has no targets, matching current behavior.

On failure, it returns a reason instead of producing a partial change. Failures cover stale badges, stale parent ownership, mismatched targets, invalid target entities, and duplicate runtime identities.

## Connections

- Consumes an `expand` result from [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Produces a [GraphChangeSet](GraphChangeSet.md).
- Creates and connects [GraphExpansion](GraphExpansion.md) ownership.
- Will receive entities from the next materialization boundary.
- Its result will eventually be applied by [GraphStore](GraphStore.md).
