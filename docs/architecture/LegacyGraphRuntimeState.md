# LegacyGraphRuntimeState

## Purpose

`LegacyGraphRuntimeState` adapts the current engine-owned graph to the read side of [GraphRuntimeState](GraphRuntimeState.md).

Current implementation: [`src/graph-application/LegacyGraphRuntimeState.ts`](../../src/graph-application/LegacyGraphRuntimeState.ts)

It is dormant and is not yet constructed by `GraphEngine` or `GraphView`.

## Responsibilities

- Report the fixed runtime mode `legacy`.
- Return the detached snapshot supplied by a `GraphSnapshotSource`.
- Report a structural revision supplied by an injected revision source.
- Reject every `GraphChangeSet` with `runtime-read-only`.

The two dependencies are injected because the legacy engine does not yet have one structural state owner or one structural revision counter. In future composition, [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md) can provide snapshots while a narrow legacy revision adapter provides the counter.

## Important boundary

This adapter does not mutate legacy arrays and does not translate a change set into legacy method calls. Legacy commands continue through their existing tested executors until a complete store-mode command path exists.

## Connections

- Implements [GraphRuntimeState](GraphRuntimeState.md).
- Can read through [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md).
- Is the read-only counterpart to [StoreGraphRuntimeState](StoreGraphRuntimeState.md).
- Obeys the rollback and no-mirroring rules in [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md).
