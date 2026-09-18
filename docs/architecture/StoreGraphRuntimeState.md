# StoreGraphRuntimeState

## Purpose

`StoreGraphRuntimeState` adapts [GraphStore](GraphStore.md) to the common [GraphRuntimeState](GraphRuntimeState.md) boundary.

Current implementation: [`src/graph-application/StoreGraphRuntimeState.ts`](../../src/graph-application/StoreGraphRuntimeState.ts)

It is implemented and tested but dormant. Production composition does not select store mode yet.

## Responsibilities

- Report the fixed runtime mode `store`.
- Return detached snapshots from its one `GraphStore`.
- Expose the store revision as the current structural revision.
- Delegate a complete `GraphChangeSet` to `GraphStore.applyChangeSet()`.
- Default the expected revision to the current revision for synchronous callers.

Asynchronous callers should capture `getStructuralRevision()` before calculating a change set and pass that captured value explicitly. If the graph changes first, the store rejects the stale work atomically.

## Important boundary

This wrapper does not import or mirror legacy arrays. Store-mode initialization will create its `GraphStore` once from a validated initial snapshot; subsequent structural changes must use store commands.

## Connections

- Implements [GraphRuntimeState](GraphRuntimeState.md).
- Wraps one [GraphStore](GraphStore.md).
- Applies [GraphChangeSet](GraphChangeSet.md) values with revision protection.
- Will eventually serve [GraphQueries](GraphQueries.md), controllers, rendering projections, and persistence in store mode.
- Cannot become production-selectable until the gates in [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) are satisfied.
