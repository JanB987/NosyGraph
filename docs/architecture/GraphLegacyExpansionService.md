# GraphLegacyExpansionService

## Purpose

`GraphLegacyExpansionService` owns the legacy expansion and collapse algorithm while the graph runtime is being migrated. It operates on injected expansion maps and a small runtime port, so the ownership rules can be tested without Obsidian, canvas, or physics dependencies.

Current implementation: `src/graph-application/GraphLegacyExpansionService.ts`

## Responsibilities

- Create and remove expansion ownership records for a badge key.
- Resolve target notes through the injected relationship resolver.
- Create target nodes through the injected node-construction boundary.
- Track parent expansion relationships and collapse nested subtrees deepest-first.
- Reconcile current files, hover highlighting, edge rebuilding, and persistence notifications through callbacks.

The service does not read Obsidian metadata directly, render badges, persist graph documents, or implement physics. `GraphEngine` currently supplies the compatibility port; the eventual store executor can implement the same boundary.

## Runtime rebuild invariant

After a child-node badge is expanded, the source may be a duplicate runtime node whose note path is intentionally absent from the canonical `currentFiles` set. Edge rebuilding must therefore accept an expansion source when either its canonical path is visible or its runtime node identity is still present. This keeps nested child expansions and their targets alive until the next reconciliation removes them.

## Migration state

Normal badge toggles now delegate from `GraphEngine` through `GraphBadgeExpansionCoordinator` to this service. Embedded-node expansion and parent-semantic expansion remain separate legacy runtime operations until their store commands are migrated.
