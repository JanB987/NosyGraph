# GraphStore Ownership Cutover

## Purpose

This document defines how runtime ownership moves from the current `GraphEngine` arrays to [GraphStore](GraphStore.md) without maintaining two synchronized mutable graphs.

The cutover is larger than replacing the badge executor. Nodes, edges, badges, expansions, queries, rendering, physics, and persistence currently meet inside `GraphEngine`; switching only one of them would create split-brain state.

## Current ownership

| State | Current live owner | New architecture status |
|---|---|---|
| Selection | `GraphStore` | Live |
| Notes | Derived by `LegacyGraphSnapshotAdapter` | Read and compared |
| Nodes | `GraphEngine.nodes` and `nodeMap` | Modeled, queried, and compared |
| Edges | `GraphEngine.edges` | Modeled, normalized, and compared |
| Badges | Derived from engine and LinkType configuration | Modeled, materialized, and compared |
| Expansions | Legacy expansion maps | Modeled with explicit ownership and compared |
| Lenses/containers | Legacy engine collections | Snapshot-only |
| Positions/velocity | Mutable legacy node objects | Domain shape exists; ownership decision required before activation |
| Persistence | Graph view/engine callbacks and graph-state models | Not migrated |

## Core decision: exclusive runtime modes

There will be no live mirroring layer that applies every command to both `GraphStore` and legacy arrays.

Instead, a graph instance operates in exactly one mode:

```ts
type GraphRuntimeMode = "legacy" | "store";
```

### Legacy mode

- Current arrays remain authoritative.
- `LegacyGraphSnapshotAdapter` supplies detached query snapshots.
- `LegacyGraphBadgeToggleExecutor` performs visible mutations.
- The new transition path remains diagnostic shadow code.

### Store mode

- `GraphStore` is the only semantic graph owner.
- `GraphQueries` reads directly from `GraphStore`.
- `GraphStoreBadgeToggleExecutor` applies normal badge transitions.
- Rendering receives store projections rather than reading legacy collections.
- Physics publishes frames through an explicit kinematics boundary.
- Persistence observes committed store transitions.

Mode is selected when the graph runtime is created. It is not changed while that graph instance is open. This prevents half-migrated operations and makes rollback equivalent to reopening in legacy mode.

## Consistency unit

The following collections must switch ownership together:

- Notes
- Node semantic identity and origin
- Edges
- Badges
- Expansions

They form one consistency unit because store validation links them by identity. For example, an expansion cannot be stored without its source node, owned edges, and expanded badge.

Selection has already moved safely because it has a small independent command surface. Lenses and containers may move later only if store mode initially treats them as immutable imported configuration; any live lens mutation requires their store command path to exist first.

## Kinematics decision required

`GraphNodeInstance` currently contains both semantic state and rapidly changing physics values. Incrementing the structural store revision every animation frame would make asynchronous transitions permanently stale.

Before store mode activates, use separate concepts:

```ts
interface GraphNodeState {
  id: NodeInstanceId;
  noteId: NoteId;
  contextId: GraphContextId;
  radius: number;
  pinned: boolean;
  origin: GraphNodeOrigin;
}

interface GraphKinematicsFrame {
  positions: ReadonlyMap<NodeInstanceId, GraphPoint>;
  velocities: ReadonlyMap<NodeInstanceId, GraphVector>;
}
```

The structural revision guards topology, metadata, badges, ownership, and user commands. Physics frames have their own sequence and do not invalidate note materialization. Initial placement may use the newest available frame when a transition commits.

This separation can be introduced while keeping the current `GraphSnapshot` shape as a composed read model.

## Incremental implementation stages

### Stage 0 — validation gate

- Complete [Badge Toggle Shadow Regression](BadgeToggleShadowRegression.md).
- Resolve or explicitly accept every semantic difference.
- Keep legacy mode as the only selectable runtime.

### Stage 1 — runtime boundary

Introduce a small `GraphRuntimeState` contract used by `GraphController` and queries:

```ts
interface GraphRuntimeState extends GraphSnapshotSource {
  readonly mode: GraphRuntimeMode;
  getStructuralRevision(): number;
  applyChangeSet(changeSet, expectedRevision?): GraphChangeSetApplyResult;
}
```

- `LegacyGraphRuntimeState` is read-only for structural changes and continues to delegate live behavior.
- `StoreGraphRuntimeState` wraps `GraphStore` and is tested but not selected by production composition.
- Do not add bidirectional synchronization methods.

Implemented as dormant, tested types: [GraphRuntimeState](GraphRuntimeState.md), [LegacyGraphRuntimeState](LegacyGraphRuntimeState.md), and [StoreGraphRuntimeState](StoreGraphRuntimeState.md). Production remains on the existing legacy composition.

### Stage 2 — kinematics boundary

- Extract physics input/output projections from legacy node objects.
- Add a frame owner distinct from structural graph state.
- Compose positions into render snapshots.
- Characterize dragging, pinning, freezing, embedded boundaries, and layout settings.

The host-neutral [GraphKinematicsFrame](GraphKinematicsFrame.md) and dormant [GraphKinematicsStore](GraphKinematicsStore.md) now establish separate sequencing. [GraphSnapshotKinematicsComposer](GraphSnapshotKinematicsComposer.md) overlays only revision-compatible frames and reports missing or obsolete node entries. [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md) supplies a minimal, detached physics model. Source-level behavior is recorded in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md); interaction-heavy manual cases remain pending.

### Stage 3 — store-mode initialization

- Build one initial validated `GraphSnapshot` from graph configuration and Obsidian read adapters.
- Construct `GraphStore` once from that snapshot.
- Treat importing the initial snapshot as bootstrapping, not ongoing mirroring.
- Reject invalid initial references before mounting the graph.

### Stage 4 — renderer compatibility projection

- Make drawing and hit testing consume a read-only projection.
- Keep DOM/canvas handles in renderer-owned maps keyed by stable IDs.
- Remove semantic mutations from rendering helpers.
- Verify equivalent node, edge, badge, and lens output in store-mode tests.

### Stage 5 — command activation

- Route normal badge toggles to `GraphStoreBadgeToggleExecutor` in store mode.
- Route selection, pinning, root changes, and relationship refresh through controller commands.
- Reject stale asynchronous work by structural revision.
- Keep unsupported parent/input/chain operations disabled in store mode until their commands exist; never silently fall back to mutating legacy arrays.

### Stage 6 — persistence and host events

- Persist committed structural transitions through an Obsidian adapter.
- Convert metadata and vault events into commands or refresh plans.
- Add loop prevention for writes caused by the plugin itself.
- Restore persisted state into store-mode initialization rather than replaying legacy toggles.

### Stage 7 — activation and removal

- Add an explicit test-branch setting for store mode.
- Run automated validation and the full manual matrix in both modes.
- Make store mode the default only after parity.
- Delete shadow comparison and the normal-toggle legacy executor.
- Remove legacy semantic arrays only when no legacy-only feature reads them.

## Activation gates

Store mode must not become selectable until:

1. Initial graph construction produces a valid store snapshot.
2. Renderer and physics can operate without semantic writes to legacy arrays.
3. Normal expand and collapse pass automated and manual parity checks.
4. Unsupported commands fail visibly rather than crossing runtime modes.
5. Persistence can restore the same structural state without toggle replay.
6. Closing and reopening a graph does not change identities or ownership.

## Rollback

Rollback does not translate live store state back into legacy arrays.

1. Keep the persisted graph document compatible during the trial period.
2. Close the store-mode graph instance.
3. Reopen it in legacy mode from persisted configuration.
4. Capture the rejected store snapshot and diagnostic reason for investigation.

This makes rollback explicit and avoids a reverse synchronization path.

## First implementation increment

The runtime-mode wrappers, dormant kinematics boundaries, and normalized [GraphPhysicsSettings](GraphPhysicsSettings.md) now exist without production wiring. The next implementation increment separates persistent pins from transient physics constraints. The manual badge matrix remains an independent activation gate and must still be completed before replacing live legacy mutation.
