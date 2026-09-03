# LegacyGraphRuntimeState

## Purpose

`LegacyGraphRuntimeState` adapts the current engine-owned graph to the read side of [GraphRuntimeState](GraphRuntimeState.md).

Current implementation: [`src/graph-application/LegacyGraphRuntimeState.ts`](../../src/graph-application/LegacyGraphRuntimeState.ts)

`GraphEngine` now constructs it for the read-only [GraphPhysicsShadowInputService](GraphPhysicsShadowInputService.md). It still has no mutation authority and is not the production state owner.

## Responsibilities

- Report the fixed runtime mode `legacy`.
- Return the detached snapshot supplied by a `GraphSnapshotSource`.
- Report a structural revision supplied by an injected revision source.
- Reject every `GraphChangeSet` with `runtime-read-only`.

The two dependencies are injected because the legacy engine does not yet have one structural state owner. Production composition supplies [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md) plus a narrow counter advanced by the existing topology-signature check.

## Important boundary

This adapter does not mutate legacy arrays and does not translate a change set into legacy method calls. Legacy commands continue through their existing tested executors until a complete store-mode command path exists.

## Connections

- Implements [GraphRuntimeState](GraphRuntimeState.md).
- Can read through [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md).
- Is the read-only counterpart to [StoreGraphRuntimeState](StoreGraphRuntimeState.md).
- Obeys the rollback and no-mirroring rules in [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md).
