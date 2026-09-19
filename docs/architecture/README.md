# NosyGraph Architecture Guide

This guide describes the target architecture for the incremental NosyGraph refactor. It is written as a learning map: each page explains one concept, its public surface, and the classes around it.

The existing plugin remains operational while responsibilities move out of the large `src/GraphEngine.ts` and `src/GraphView.ts` files one at a time.

## Current release checkpoint

The prepared release is NosyGraph `0.2.9`, at local commit `46ebb0e` with
annotated tag `v0.2.9`. Release metadata, the generated bundle, scoped
typecheck, production build, and the 83-file/385-test suite have been
validated. The local `origin/main` tracking ref now contains the release
commit; verify the remote tag and publish the GitHub release before the
release checker scans `0.2.9`. See
[the development handover](../Handover-2026-09-19.md).

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

The flow above is the guarded store-mode composition. The live Obsidian path still composes GraphView directly with GraphEngine until the activation gates and ownership audit are complete.
```

## Class map

### Application coordination

- [GraphView](GraphView.md) owns the Obsidian view lifecycle.
- [GraphController](GraphController.md) executes user and host commands.
- [GraphStore](GraphStore.md) is the single owner of runtime graph state.
- [GraphStoreInitializer](GraphStoreInitializer.md) bootstraps store mode from one validated host-adapted snapshot.
- [GraphSceneStore](GraphSceneStore.md) owns detached lens, group, and container records through explicit lifecycle commands.
- [GraphDocumentPersistence](GraphDocument.md) serializes and restores committed graph and scene state directly.
- [ObsidianGraphDocumentRepository](ObsidianAdapters.md) connects persistence to the host storage gateway.
- [GraphLifecycleCoordinator](GraphLifecycleCoordinator.md) owns document generations, async cancellation, event lifetime, timer cleanup, and write-loop suppression.
- [StoreGraphRuntime](StoreGraphRuntime.md) composes the detached stores, renderer, physics coordinator, commands, persistence, and lifecycle into one document runtime.
- [Store-mode activation gates](StoreModeActivationGates.md) records D2 verification and the remaining manual activation limits.
- [Dual-mode regression and performance comparison](GraphModeRegression.md) records D4 coverage for persistence, sizes, interaction boundaries, timing samples, and cleanup.
- [GraphKinematicsStore](GraphKinematicsStore.md) independently owns the latest high-frequency motion frame.
- [GraphSnapshotKinematicsComposer](GraphSnapshotKinematicsComposer.md) safely overlays compatible motion onto detached semantic snapshots.
- [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md) strips snapshots down to detached physics-facing data.
- [GraphPhysicsConstraintProjector](GraphPhysicsConstraintProjector.md) combines semantic pins with detached transient constraints.
- [GraphPhysicsContainerProjector](GraphPhysicsContainerProjector.md) validates and detaches container membership, bounds, gravity, and ancestry.
- [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) assembles all detached physics inputs behind one versioned boundary.
- [GraphPhysicsEngine](GraphPhysicsEngine.md) defines the compiled motion port and a deterministic orchestration test implementation.
- [GraphPhysicsCoordinator](GraphPhysicsCoordinator.md) protects engine stepping and kinematics-frame publication.
- [LegacyGraphPhysicsSettingsAdapter](LegacyGraphPhysicsSettingsAdapter.md) translates legacy global and LinkType settings without host imports.
- [LegacyGraphPhysicsConstraintAdapter](LegacyGraphPhysicsConstraintAdapter.md) translates overloaded legacy locks, targets, and freeze sets into explicit variants.
- [LegacyGraphPhysicsContainerAdapter](LegacyGraphPhysicsContainerAdapter.md) translates parent/embedded records and derives stable container nesting.
- [LegacyGraphPhysicsReadAdapter](LegacyGraphPhysicsReadAdapter.md) composes all copied legacy physics reads behind one facade.
- [GraphRuntimeState](GraphRuntimeState.md) is the common snapshot, revision, and structural-change boundary for one runtime mode.
- [GraphRuntimeModeSelector](GraphRuntimeModeSelector.md) selects one guarded mode at graph creation and closes before rollback to legacy.
- [GraphRuntimeActivationPolicy](GraphRuntimeActivationPolicy.md) makes store mode default only after all parity and ownership evidence is recorded.
- [Legacy ownership audit](LegacyOwnershipAudit.md) records the live dependencies that still block D6 cleanup.
- [Architecture audit](ArchitectureAudit.md) checks source boundaries and records which orchestration limits remain.
- [E1 baseline](Baseline.md) records the reproducible validation and vault-readiness checkpoint.
- [E10 artifact audit](ArtifactAudit.md) classifies generated, diagnostic, migration, adapter, and experimental artifacts before cleanup.
- [LegacyGraphRuntimeState](LegacyGraphRuntimeState.md) exposes legacy state as read-only through that boundary.
- [StoreGraphRuntimeState](StoreGraphRuntimeState.md) delegates the boundary atomically to `GraphStore`.
- [GraphQueries](GraphQueries.md) provides safe, read-only access to graph state.
- [GraphBadgeRequest](GraphBadgeRequest.md) carries resolved badge intent without host objects.
- [GraphRenderVisibilityPolicy](GraphRenderVisibilityPolicy.md) separates live existing-node line rendering and badge visibility from graph discovery and host access.
- [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md) describes normal expand/collapse decisions without mutation.
- [GraphBadgeToggleService](GraphBadgeToggleService.md) composes live graph state and relationship targets into a complete plan.
- [GraphBadgeExpansionCoordinator](GraphBadgeExpansionCoordinator.md) routes normal, parent, and embedded badge expansion through a runtime port.
- [GraphLegacyExpansionService](GraphLegacyExpansionService.md) owns compatibility expansion ownership and nested collapse ordering behind that port.
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
- [GraphPhysicsInput](GraphPhysicsInput.md) contains only versioned nodes and edges required by physics.
- [GraphPhysicsSettings](GraphPhysicsSettings.md) normalizes global simulation values and distinct force/direction LinkType policies.
- [GraphPhysicsConstraints](GraphPhysicsConstraints.md) separates persisted pins from transient locks, targets, and freezes.
- [GraphPhysicsContainers](GraphPhysicsContainers.md) models host-neutral spatial membership, bounds, nesting, and embedded gravity.
- [GraphNote](GraphNote.md) represents a Markdown note independently of its visualization.
- [GraphBadge](GraphBadge.md) describes an available node expansion.
- [GraphExpansion](GraphExpansion.md) records ownership of nodes and edges added through a badge.
- [GraphChangeSet](GraphChangeSet.md) describes atomic upserts and removals across graph state.
- [GraphExpansionChangeSet](GraphExpansionChangeSet.md) creates atomic expansion changes from materialized entities.
- [GraphCollapseChangeSet](GraphCollapseChangeSet.md) safely removes expansion subtrees while preserving shared ownership.
- [GraphEdge and LinkType](GraphEdgeAndLinkType.md) separate visible edges from relationship rules.
- [GraphLens](GraphLens.md) defines a viewport into another graph context.
- [EmbeddedGraphPersistencePolicy](EmbeddedGraphPersistencePolicy.md) defines ownership and initialization rules for runtime state created inside lenses.
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
- [Legacy Physics Characterization](LegacyPhysicsCharacterization.md) records the live force, direction, pin, container, freeze, and settling behavior that extraction must preserve.

## Rules of the architecture

1. A Markdown note and a visible graph-node instance are different objects.
2. In store mode, runtime state has one owner: `GraphStore`. Legacy mode keeps `GraphEngine` as owner until the cutover gates pass.
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

## Migration status

See [Migration status](MigrationStatus.md) for the canonical distinction between components that are implemented, live, experimental, or still proposed. The progress checklist below records completed extraction work; a checked item does not by itself activate that code in the production plugin.

- **Implemented** — host-neutral code and automated coverage exist.
- **Live** — the production Obsidian path selects the component.
- **Experimental** — detached, shadow, staged, or explicitly diagnostic code that does not own production behavior.
- **Proposed** — recorded design or follow-up awaiting implementation or an activation gate.

## Current progress

- [x] Target architecture documented.
- [x] Note and node-instance identities separated in host-neutral types.
- [x] Expansion ownership represented explicitly.
- [x] First read-only `GraphQueries` API added.
- [x] Adapt the active engine to expose a read-only `GraphSnapshot`.
- [x] Add initial query and adapter characterization tests.
- [x] Add snapshot coverage for edge and lens details.
- [x] Introduce `GraphStore` and make it the single owner of selection state.
- [x] Implement validated [GraphStore initialization](GraphStoreInitializer.md) with stable identities and reference rejection.
- [x] Introduce `GraphController` and route selection mutations through it.
- [x] Connect `GraphBadge` to the live read-only snapshot and query API.
- [x] Route standard node-badge intents through `GraphController` while delegating expansion behavior to the legacy engine.
- [x] Route the older parent-overlay badge controls through the same command boundary.
- [x] Complete controller routing for selection, normal badges, pinning, dragging, root changes, and relationship refresh through explicit host ports.
- [x] Migrate parent-semantic badges, Alt-click input, and Ctrl/Cmd-click chain expansion through characterized controller commands.
- [x] Add experimental GraphSceneStore ownership and controller commands for lens, group, and container creation, updates, and removal.
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
- [x] Compose compatible kinematics frames into detached render snapshots.
- [x] Add the experimental [GraphRenderer](GraphRenderer.md) boundary for detached drawing and hit testing.
- [x] Integrate renderer, physics, commands, persistence, and lifecycle behind StoreGraphRuntime while keeping semantic revisions separate from motion-frame sequences.
- [x] Verify store-mode activation gates, detached supported operations, and visible unsupported-command failures.
- [x] Add guarded store-mode trial selection and close/reopen rollback to legacy mode.
- [x] Run dual-mode regression and performance comparisons for persistence, representative sizes, interaction boundaries, and lifecycle cleanup.
- [x] Add the evidence-gated default-selection policy for store mode; keep legacy default while required parity evidence is incomplete.
- [ ] Remove obsolete legacy owners after all supported dependencies and parity gates are cleared.
- [x] Extract host-neutral physics input projections from semantic snapshots and current motion.
- [x] Characterize legacy physics inputs for contexts, pinning, and link-force settings.
- [x] Introduce host-neutral physics settings and LinkType force-policy normalization.
- [x] Separate persistent pin intent from transient physics constraints in dormant types.
- [x] Project persistent pins and transient constraints into one detached physics constraint state.
- [x] Model container membership and bounds as host-neutral physics constraints.
- [x] Validate and detach container physics projections against graph snapshots.
- [x] Compose all versioned physics inputs behind one runtime boundary.
- [x] Define the host-neutral `PhysicsEngine` code contract and deterministic test implementation.
- [x] Coordinate physics input, stepping, and protected kinematics-frame publication.
- [x] Adapt legacy global and LinkType physics configuration into host-neutral settings input.
- [x] Adapt legacy transient lock, drag, direction, and freeze state into constraint input.
- [x] Adapt legacy parent and embedded containers into validated physics container candidates.
- [x] Compose legacy physics reads behind one host-neutral facade before production wiring.
- [x] Add a dormant `GraphEngine` method that captures the facade's plain read state.
- [x] Compose a live read-only physics runtime input for shadow diagnostics without stepping it.
- [x] Wire the shadow input service to `GraphEngine` without calling it from the animation loop.
- [x] Define a compact physics shadow diagnostic summary and comparison boundary.
- [x] Add an opt-in observer for explicit physics shadow captures.
- [x] Expose compact observation through `GraphEngine` without automatic logging.
- [x] Define a compact kinematics-frame summary for solver parity evidence.
- [x] Adapt legacy node motion into a detached kinematics frame.
- [x] Expose the detached legacy kinematics frame with matching structural revision.
- [x] Compose input and frame evidence into one version-checked shadow sample.
- [x] Expose explicit version-checked sample capture through `GraphEngine`.
- [x] Add a detached replacement-engine frame runner for parity experiments.
- [x] Define a bounded per-node kinematics comparator for parity experiments.
- [x] Compose legacy and experiment frames behind one explicit parity service.
- [x] Expose the safe zero-step parity check through `GraphEngine`.
- [x] Extract a pure pairwise-repulsion calculation from the characterized solver behavior.
- [x] Extract a pure boundary-based link-spring calculation.
- [x] Exclude non-force overlay edges at the physics projection boundary.
- [x] Compose node repulsion and link springs in a stateless force accumulator.
- [x] Extract pure world-center and embedded-container gravity calculations.
- [x] Add eligible center gravity to the stateless force accumulator.
- [x] Extract constraint-aware damping and position integration.
- [x] Extract parent and embedded container-boundary confinement.
- [x] Compose pure force, integration, and confinement stages in a parity engine.
- [x] Extract node-container repulsion and origin reaction math.
- [x] Model container influence distances derived from legacy base node radius.
- [x] Add node-container repulsion eligibility to the force accumulator.
- [x] Extract container-to-container repulsion and origin-transfer math.
- [x] Apply eligible container-pair reactions in the force accumulator.
- [x] Define detached container anchoring runtime state separately from membership/configuration.
- [x] Extract post-integration [container anchoring and member translation](GraphContainerAnchoring.md).
- [x] Compose anchoring, evolving bounds/history and fixed coordinates, and a second confinement pass into the staged engine.
- [x] Add an explicit [anchoring seed/state boundary](GraphPhysicsAnchoringState.md) and verify multi-step staged state persistence.
- [x] Reconcile anchoring state across structural revisions, container additions/removals, compatible updates, and changed container identity/origin.
- [x] Prune fixed coordinates for removed graph nodes while preserving surviving node state.
- [x] Extract [dynamic container synchronization and recalculation](GraphPhysicsContainerSynchronizer.md).
- [x] Extract [settling cadence and simulation status policy](GraphSettlingPolicy.md).
- [x] Audit [legacy solver parity gaps](LegacySolverParityAudit.md) across constraints, dragging, pins, freezes, directional links, lenses, and force eligibility.
- [x] Establish [non-zero-step parity](GraphPhysicsNonZeroParity.md) over one and multiple synchronized steps with documented tolerances.
- [ ] Complete [interactive physics verification](InteractivePhysicsVerification.md) in Obsidian; the UI pass is pending a callable Computer Use session.
- [ ] Capture legacy anchor state and broaden host-event/lifecycle reconciliation.

## Validation during the migration
Run `npm run typecheck` for the new host-neutral architecture and `npm run build` for the complete legacy plugin bundle. The architecture typecheck is deliberately scoped: dormant Working Memory extraction files currently reference modules that are not part of this package, and the active legacy files contain pre-existing strict-type errors. Expanding the strict boundary will be a gradual part of the refactor.

### Obsidian adapter extraction

- [ObsidianNoteRepository](ObsidianAdapters.md) reads detached notes and relationship links.
- [ObsidianRelationshipTargetReader](ObsidianAdapters.md) resolves configured relationship directions.
- [ObsidianGraphLinkResolver](ObsidianGraphLinkResolver.md) owns synchronous frontmatter parsing and linkpath resolution for the legacy renderer.
- [ObsidianNoteWriter](ObsidianAdapters.md) isolates frontmatter relationship and property writes.
- [ObsidianNavigationAdapter](ObsidianAdapters.md) owns opening, reveal, and hover requests.
- [ObsidianGraphWatcher](ObsidianAdapters.md) normalizes host lifecycle events.

- [x] Complete Obsidian adapter boundaries for note reads and writes, relationship resolution, navigation, and normalized host events.

- [x] Add versioned direct GraphDocument persistence and restoration for committed identities, ownership, expansions, scenes, layouts, and viewports.

- [x] Add lifecycle coordination for stale async work, host rename/delete/metadata events, write-loop suppression, reopen behavior, and resource cleanup.
