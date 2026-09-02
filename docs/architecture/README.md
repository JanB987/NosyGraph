# NosyGraph Architecture Guide

This guide describes the target architecture for the incremental NosyGraph refactor. It is written as a learning map: each page explains one concept, its public surface, and the classes around it.

The existing plugin remains operational while responsibilities move out of the large `src/GraphEngine.ts` and `src/GraphView.ts` files one at a time.

## Runtime flow

```text
Obsidian event or user input
            |
            v
       GraphView
            |
            v
     GraphController <-------- GraphQueries
            |                       |
            v                       v
        GraphStore ------------ GraphSnapshot
          |     |
          |     +--------> PhysicsEngine
          |
          +--------------> GraphRenderer
            
GraphController <--------> Obsidian adapters
```

## Class map

### Application coordination

- [GraphView](GraphView.md) owns the Obsidian view lifecycle.
- [GraphController](GraphController.md) executes user and host commands.
- [GraphStore](GraphStore.md) is the single owner of runtime graph state.
- [GraphKinematicsStore](GraphKinematicsStore.md) independently owns the latest high-frequency motion frame.
- [GraphRuntimeState](GraphRuntimeState.md) is the common snapshot, revision, and structural-change boundary for one runtime mode.
- [LegacyGraphRuntimeState](LegacyGraphRuntimeState.md) exposes legacy state as read-only through that boundary.
- [StoreGraphRuntimeState](StoreGraphRuntimeState.md) delegates the boundary atomically to `GraphStore`.
- [GraphQueries](GraphQueries.md) provides safe, read-only access to graph state.
- [GraphBadgeRequest](GraphBadgeRequest.md) carries resolved badge intent without host objects.
- [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md) describes normal expand/collapse decisions without mutation.
- [GraphBadgeToggleService](GraphBadgeToggleService.md) composes live graph state and relationship targets into a complete plan.
- [GraphBadgeToggleExecutor](GraphBadgeToggleExecutor.md) applies a validated plan and reports its outcome.
- [GraphStoreBadgeToggleExecutor](GraphStoreBadgeToggleExecutor.md) applies calculated transitions atomically and rejects stale asynchronous work.
- [GraphBadgeToggleHandler](GraphBadgeToggleHandler.md) joins planning and execution behind one application operation.
- [GraphRelationshipTargetReader](GraphRelationshipTargetReader.md) resolves note-level expansion targets behind a host-neutral interface.
- [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md) turns planned note IDs into complete graph entities.
- [LegacyGraphExpansionBadgeAdapter](LegacyGraphExpansionBadgeAdapter.md) materializes configured badges for new expansion nodes.
- [GraphExpansionTransitionService](GraphExpansionTransitionService.md) composes materialization and atomic expansion calculation.
- [GraphBadgeToggleTransitionService](GraphBadgeToggleTransitionService.md) calculates either expand or collapse through one boundary.
- [GraphBadgeToggleShadowService](GraphBadgeToggleShadowService.md) runs that calculation against a captured snapshot while preserving legacy mutation.
- [GraphBadgeToggleShadowComparator](GraphBadgeToggleShadowComparator.md) compares calculated semantic state with the legacy result.
- [GraphDocument](GraphDocument.md) describes persisted graph-note configuration and runtime state.

### Domain concepts

- [GraphNodeInstance](GraphNodeInstance.md) is one visible occurrence of a note.
- [GraphKinematicsFrame](GraphKinematicsFrame.md) carries sequenced positions and velocities stamped with their structural revision.
- [GraphNote](GraphNote.md) represents a Markdown note independently of its visualization.
- [GraphBadge](GraphBadge.md) describes an available node expansion.
- [GraphExpansion](GraphExpansion.md) records ownership of nodes and edges added through a badge.
- [GraphChangeSet](GraphChangeSet.md) describes atomic upserts and removals across graph state.
- [GraphExpansionChangeSet](GraphExpansionChangeSet.md) creates atomic expansion changes from materialized entities.
- [GraphCollapseChangeSet](GraphCollapseChangeSet.md) safely removes expansion subtrees while preserving shared ownership.
- [GraphEdge and LinkType](GraphEdgeAndLinkType.md) separate visible edges from relationship rules.
- [GraphLens](GraphLens.md) defines a viewport into another graph context.
- [GraphGroup and GraphContainer](GraphGroupAndContainer.md) separate visual classification from spatial ownership.

### Technical boundaries

- [GraphRenderer](GraphRenderer.md) draws snapshots and emits interaction intents.
- [PhysicsEngine](PhysicsEngine.md) calculates positions without knowing about Obsidian.
- [Obsidian adapters](ObsidianAdapters.md) isolate note access, writes, watchers, navigation, and persistence.
- [ObsidianGraphExpansionNoteAdapter](ObsidianGraphExpansionNoteAdapter.md) reads expansion notes and missing targets through an injected Obsidian gateway.
- [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md) is the temporary, tested bridge from badge commands to legacy expansion operations.
- [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md) exposes a detached, host-neutral snapshot of the current engine.
- [LegacyGraphRelationshipTargetAdapter](LegacyGraphRelationshipTargetAdapter.md) translates the current link resolver into host-neutral targets.
- [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md) safely applies plans through the current toggle operation.

### Migration validation

- [Badge Toggle Shadow Regression](BadgeToggleShadowRegression.md) defines the repeatable manual matrix and evidence required before live state cutover.
- [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) defines exclusive runtime modes, activation gates, and the staged move out of `GraphEngine`.

## Rules of the architecture

1. A Markdown note and a visible graph-node instance are different objects.
2. Runtime state has one owner: `GraphStore`.
3. Queries never return mutable internal collections.
4. Domain objects do not call Obsidian APIs or handle DOM events.
5. The renderer emits intents; `GraphController` decides their meaning.
6. Regular-note frontmatter remains the source of truth for relationships.
7. Every extraction keeps the plugin buildable and preserves existing behavior.

## Migration order

1. Establish vocabulary and characterization tests.
2. Add domain identity types and `GraphQueries`.
3. Move state into `GraphStore` in small groups.
4. Route interactions through `GraphController`.
5. Extract Obsidian adapters.
6. Separate renderer and physics.
7. Move lenses, containers, and persistence last.

## Current progress

- [x] Target architecture documented.
- [x] Note and node-instance identities separated in host-neutral types.
- [x] Expansion ownership represented explicitly.
- [x] First read-only `GraphQueries` API added.
- [x] Adapt the active engine to expose a read-only `GraphSnapshot`.
- [x] Add initial query and adapter characterization tests.
- [x] Add snapshot coverage for edge and lens details.
- [x] Introduce `GraphStore` and make it the single owner of selection state.
- [x] Introduce `GraphController` and route selection mutations through it.
- [x] Connect `GraphBadge` to the live read-only snapshot and query API.
- [x] Route standard node-badge intents through `GraphController` while delegating expansion behavior to the legacy engine.
- [x] Route the older parent-overlay badge controls through the same command boundary.
- [x] Extract legacy badge-target resolution into a dedicated command adapter.
- [x] Introduce a host-neutral badge expansion request before extracting expansion calculations.
- [x] Characterize the inputs and results of normal badge toggle expansion.
- [x] Add a host-neutral relationship-target reader for normal badge expansion.
- [x] Compose target reading and toggle planning in a `GraphBadgeToggleService`.
- [x] Define a `GraphBadgeToggleExecutor` boundary for applying plans with legacy behavior.
- [x] Compose planning and execution behind one normal-badge toggle handler.
- [x] Route live normal badge toggles through `GraphBadgeToggleHandler`.
- [x] Define the atomic `GraphChangeSet` data contract and helpers.
- [x] Create expansion change sets from materialized target nodes and edges.
- [x] Extract a host-neutral boundary that materializes target notes, nodes, and edges.
- [x] Compose materialization and change-set creation behind one expansion transition service.
- [x] Add atomic `GraphChangeSet` application to `GraphStore`.
- [x] Create atomic collapse change sets with shared-ownership protection.
- [x] Compose expand and collapse calculation behind one toggle transition service.
- [x] Add a store-backed toggle executor with stale-transition protection.
- [x] Adapt Obsidian note reads to the expansion materializer and compose the new path in non-mutating shadow mode.
- [x] Record and compare shadow change sets with the graph state produced by legacy execution.
- [x] Align legacy expansion-edge identity and origin with explicit expansion ownership.
- [x] Materialize badges for newly visible expansion target nodes.
- [x] Compare note-state semantics and unify snapshot and expansion note conversion.
- [x] Create the shadow-mode manual regression matrix and diagnostic checklist.
- [ ] Complete a documented manual regression pass before replacing live legacy mutation.
- [x] Plan the live collection-ownership cutover from `GraphEngine` to `GraphStore`.
- [x] Introduce dormant runtime-mode types and state wrappers without changing production composition.
- [x] Separate structural revision from kinematics frame sequencing in dormant domain and store types.
- [ ] Compose compatible kinematics frames into detached render snapshots.

## Validation during the migration

Run `npm run typecheck` for the new host-neutral architecture and `npm run build` for the complete legacy plugin bundle. The architecture typecheck is deliberately scoped: dormant Working Memory extraction files currently reference modules that are not part of this package, and the active legacy files contain pre-existing strict-type errors. Expanding the strict boundary will be a gradual part of the refactor.
