# GraphBadgeExpansionCoordinator

## Purpose

`GraphBadgeExpansionCoordinator` interprets a badge expansion request and selects the runtime operation for normal, parent-semantic, and embedded nodes.

Current implementation: `src/graph-application/GraphBadgeExpansionCoordinator.ts`

## Responsibilities

- Normalize the source node and LinkType identity.
- Route embedded nodes to the embedded expansion operation.
- Route parent-semantic badges to parent expansion.
- Route ordinary badges to the normal link-type toggle operation.
- Depend only on a small runtime port supplied by the current graph runtime.

It does not read frontmatter, call Obsidian APIs, own expansion collections, construct nodes, persist graph state, or render badges.

## Migration state

`GraphEngine` supplies the temporary runtime port. Normal toggles delegate through `GraphLegacyExpansionService`, which owns the legacy expansion maps and collapse ordering behind callbacks. The coordinator itself only routes commands. Embedded and parent expansion remain separate compatibility operations until their store commands are migrated.