# GraphCollapseChangeSet

## Purpose

`createGraphCollapseChangeSet` calculates the complete atomic removal of one expansion and its descendant expansions.

Current implementation: [`src/graph-application/GraphCollapseChangeSet.ts`](../../src/graph-application/GraphCollapseChangeSet.ts)

It is a pure function over a collapse plan and `GraphSnapshot`. It does not mutate the store, call Obsidian, rebuild derived edges, or redraw.

## Ownership rules

The factory first collects the requested expansion subtree. It then applies these rules:

1. Every expansion in the subtree is removed.
2. A surviving parent has removed child IDs deleted from its `childExpansionIds`.
3. A `badge-expansion` edge is removed only when no surviving expansion also owns it.
4. Discovered, visible, overlay, and parent edges are independent and remain present.
5. A node with root, filter, or embedded-graph origin remains present.
6. A badge-expansion node remains when another expansion owns it and is re-homed to a deterministic surviving owner.
7. A note is removed only when no remaining node represents it.
8. Badges on removed nodes are removed; surviving badges whose expansions collapsed are reset to `collapsed`.

## Safety failures

The factory returns an explicit failure instead of an unsafe partial transition when:

- The badge, expansion, or plan identities are stale.
- The expansion tree references a missing child or contains a cycle.
- An expansion owns a node or edge missing from the snapshot.
- A supposedly removable node is still referenced by a retained edge, surviving expansion, or lens.

The final [GraphStore](GraphStore.md) validation provides a second referential-integrity check when the change set is applied.

## Connections

- Consumes the `collapse` branch of [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).
- Reads [GraphExpansion](GraphExpansion.md) ownership from a snapshot.
- Produces a [GraphChangeSet](GraphChangeSet.md).
- Is the collapse counterpart to [GraphExpansionChangeSet](GraphExpansionChangeSet.md).
- Produces changes accepted atomically by [GraphStore](GraphStore.md).
