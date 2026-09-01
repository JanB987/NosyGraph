# LegacyGraphSnapshotAdapter

## Purpose

`LegacyGraphSnapshotAdapter` exposes the current `GraphEngine` runtime through the immutable [GraphSnapshot](GraphQueries.md) contract while migration is in progress.

Current implementation: [`src/graph-application/LegacyGraphSnapshotAdapter.ts`](../../src/graph-application/LegacyGraphSnapshotAdapter.ts)

It is a read adapter. It copies state and never changes legacy nodes, edges, badges, expansions, or lenses.

## Responsibilities

- Deduplicate visible runtime nodes into [GraphNote](GraphNote.md) records.
- Deep-copy mutable node coordinates and expansion ownership arrays.
- Preserve node-instance identities and graph contexts.
- Expose configured [GraphBadge](GraphBadge.md) state.
- Expose [GraphExpansion](GraphExpansion.md) ownership.
- Normalize ordinary badge-owned edges to the stable `badge-expansion` identity and origin.
- Preserve independently visible, overlay, parent, and discovered edge semantics.

## Edge classification

`resolveLegacyGraphEdgeIdentity` receives both the legacy edge identity and the stable badge-expansion identity. Classification follows this precedence:

```text
parent -> overlay -> visible -> badge-expansion -> discovered
```

This matters when an expansion reuses an edge that another graph rule already keeps visible. The visible edge remains independently owned and must not be removed merely because one badge collapses.

## Connections

- Supplies snapshots to [GraphQueries](GraphQueries.md).
- Supplies before/after snapshots to [GraphBadgeToggleShadowService](GraphBadgeToggleShadowService.md).
- Uses the stable edge identity documented in [GraphEdge and LinkType](GraphEdgeAndLinkType.md).
- Will be deleted after [GraphStore](GraphStore.md) becomes the live owner of these collections.
