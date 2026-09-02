# GraphRuntimeState

## Purpose

`GraphRuntimeState` is the common state boundary for one open graph. It lets application code read a snapshot and attempt an atomic structural change without knowing which runtime implementation owns the graph.

Current implementation: [`src/graph-application/GraphRuntimeState.ts`](../../src/graph-application/GraphRuntimeState.ts)

This boundary is dormant: production composition still uses the legacy engine directly. Introducing the contract does not enable store mode or change visible behavior.

## Runtime modes

```ts
type GraphRuntimeMode = "legacy" | "store";

interface GraphRuntimeState extends GraphSnapshotSource {
  readonly mode: GraphRuntimeMode;
  getStructuralRevision(): number;
  applyChangeSet(
    changeSet: GraphChangeSet,
    expectedRevision?: number
  ): GraphRuntimeChangeSetApplyResult;
}
```

An open graph has exactly one mode. It must not switch modes or synchronize two mutable copies while open.

- `legacy` reads a detached snapshot but rejects structural change sets.
- `store` reads and changes one [GraphStore](GraphStore.md).

`getStructuralRevision()` is named for the future split between relatively infrequent semantic graph changes and rapidly changing physics frames. Its current store implementation delegates to `GraphStore.getRevision()` until that split is introduced.

## Why rejection is part of the result

Legacy mode returns `runtime-read-only` when application code attempts to apply a change set. This makes an unsupported command visible and prevents a caller from silently falling back to legacy mutation after it has entered a store-oriented path.

## Connections

- Implemented by [LegacyGraphRuntimeState](LegacyGraphRuntimeState.md) and [StoreGraphRuntimeState](StoreGraphRuntimeState.md).
- Reads [GraphSnapshot](GraphQueries.md) data.
- Applies [GraphChangeSet](GraphChangeSet.md) values only when the active implementation supports them.
- Follows the exclusive-mode rules in [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md).

## Kinematics separation

[GraphKinematicsStore](GraphKinematicsStore.md) now provides an independent sequence for physics frames. The next extraction composes a compatible frame into a detached render snapshot; neither boundary is connected to live production composition yet.
