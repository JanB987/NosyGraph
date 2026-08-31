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
- [GraphQueries](GraphQueries.md) provides safe, read-only access to graph state.
- [GraphBadgeRequest](GraphBadgeRequest.md) carries resolved badge intent without host objects.
- [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md) describes normal expand/collapse decisions without mutation.
- [GraphBadgeToggleService](GraphBadgeToggleService.md) composes live graph state and relationship targets into a complete plan.
- [GraphBadgeToggleExecutor](GraphBadgeToggleExecutor.md) applies a validated plan and reports its outcome.
- [GraphBadgeToggleHandler](GraphBadgeToggleHandler.md) joins planning and execution behind one application operation.
- [GraphRelationshipTargetReader](GraphRelationshipTargetReader.md) resolves note-level expansion targets behind a host-neutral interface.
- [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md) turns planned note IDs into complete graph entities.
- [GraphDocument](GraphDocument.md) describes persisted graph-note configuration and runtime state.

### Domain concepts

- [GraphNodeInstance](GraphNodeInstance.md) is one visible occurrence of a note.
- [GraphNote](GraphNote.md) represents a Markdown note independently of its visualization.
- [GraphBadge](GraphBadge.md) describes an available node expansion.
- [GraphExpansion](GraphExpansion.md) records ownership of nodes and edges added through a badge.
- [GraphChangeSet](GraphChangeSet.md) describes atomic upserts and removals across graph state.
- [GraphExpansionChangeSet](GraphExpansionChangeSet.md) creates atomic expansion changes from materialized entities.
- [GraphEdge and LinkType](GraphEdgeAndLinkType.md) separate visible edges from relationship rules.
- [GraphLens](GraphLens.md) defines a viewport into another graph context.
- [GraphGroup and GraphContainer](GraphGroupAndContainer.md) separate visual classification from spatial ownership.

### Technical boundaries

- [GraphRenderer](GraphRenderer.md) draws snapshots and emits interaction intents.
- [PhysicsEngine](PhysicsEngine.md) calculates positions without knowing about Obsidian.
- [Obsidian adapters](ObsidianAdapters.md) isolate note access, writes, watchers, navigation, and persistence.
- [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md) is the temporary, tested bridge from badge commands to legacy expansion operations.
- [LegacyGraphRelationshipTargetAdapter](LegacyGraphRelationshipTargetAdapter.md) translates the current link resolver into host-neutral targets.
- [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md) safely applies plans through the current toggle operation.

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
- [ ] Compose materialization and change-set creation behind one expansion transition service.
- [ ] Complete a documented manual regression pass before replacing live legacy mutation.

## Validation during the migration

Run `npm run typecheck` for the new host-neutral architecture and `npm run build` for the complete legacy plugin bundle. The architecture typecheck is deliberately scoped: dormant Working Memory extraction files currently reference modules that are not part of this package, and the active legacy files contain pre-existing strict-type errors. Expanding the strict boundary will be a gradual part of the refactor.
