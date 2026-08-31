# GraphChangeSet

## Purpose

`GraphChangeSet` is an atomic, host-neutral description of durable graph-state changes.

Current implementation: [`src/graph-domain/GraphChangeSet.ts`](../../src/graph-domain/GraphChangeSet.ts)

It separates calculating a graph transition from applying it. A calculation can therefore be tested without mutating [GraphStore](GraphStore.md), invoking Obsidian, rebuilding edges, or reheating physics.

## Structure

```ts
interface GraphChangeSet {
  cause: GraphChangeCause;
  notes: GraphEntityChanges<GraphNote, NoteId>;
  nodes: GraphEntityChanges<GraphNodeInstance, NodeInstanceId>;
  edges: GraphEntityChanges<GraphEdge, EdgeId>;
  badges: GraphEntityChanges<GraphBadge, BadgeId>;
  expansions: GraphEntityChanges<GraphExpansion, ExpansionId>;
  lenses: GraphEntityChanges<GraphLens, LensId>;
}

interface GraphEntityChanges<TEntity, TId> {
  upsert: readonly TEntity[];
  removeIds: readonly TId[];
}
```

An upsert contains the complete next entity. A removal contains only its stable identity.

## Causes

The first supported causes are:

```ts
{ kind: "badge-expand"; badgeId; expansionId }
{ kind: "badge-collapse"; badgeId; expansionId }
```

The cause supports debugging, persistence decisions, and downstream effects without embedding callbacks in domain data.

## Functions

```ts
createEmptyGraphChangeSet(cause): GraphChangeSet;
countGraphChanges(changeSet): number;
hasGraphChanges(changeSet): boolean;
```

## What is not a graph change

The following are effects that occur after a successful change is applied:

- Rebuilding derived edges
- Reconciling visible files
- Persisting graph runtime state
- Emitting toggle callbacks
- Clearing hover previews
- Reheating physics
- Redrawing the canvas

Keeping effects outside this data prevents domain code from depending on Obsidian or rendering.

## Expansion ownership

Shared nodes are represented by appearing in multiple [GraphExpansion](GraphExpansion.md) ownership lists. A collapse change removes a node only after calculation confirms that no remaining expansion or root owns it.

## Connections

- Produced from [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Expansion changes are created by [GraphExpansionChangeSet](GraphExpansionChangeSet.md).
- Will be applied atomically by [GraphStore](GraphStore.md).
- Will replace direct collection mutation in [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md).
- Supplies the durable-state portion of future persistence and rendering effects.

## Current migration state

The contract, helpers, and pure expansion factory are tested but are not connected to live execution. Live normal toggles still end in the existing legacy mutation after passing through the new handler.
