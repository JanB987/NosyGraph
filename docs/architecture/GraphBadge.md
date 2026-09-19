# GraphBadge

## Purpose

`GraphBadge` describes one link-type expansion control attached to a [GraphNodeInstance](GraphNodeInstance.md).

Current read model: [`src/graph-domain/GraphBadge.ts`](../../src/graph-domain/GraphBadge.ts)

`createGraphBadgeId(nodeId, linkTypeId)` provides the stable identity used by legacy snapshots and newly materialized target-node badges.

## Core data

```ts
interface GraphBadge {
  id: BadgeId;
  nodeId: NodeInstanceId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  label: string;
  color: string;
  state: "collapsed" | "expanded";
  semantic: "link" | "parent";
  hasRelationships: boolean;
  duplicateNodes: boolean;
  expansionId?: ExpansionId;
}
```

## Functions

```ts
buildNodeBadges(node, note, linkTypes): readonly GraphBadge[];
createGraphBadgeId(nodeId, linkTypeId): BadgeId;
```

## Click flow

1. The temporary `O3NodeBadge` DOM wrapper emits a badge intent.
2. [GraphController](GraphController.md) resolves the command and creates a [GraphBadgeRequest](GraphBadgeRequest.md).
3. `GraphController` delegates the request to the badge application boundary. `GraphBadgeExpansionCoordinator` selects the runtime operation while the legacy adapter remains temporary.
4. A later extraction will move that operation into [GraphExpansion](GraphExpansion.md) functions and apply its result to [GraphStore](GraphStore.md).

The badge itself does not mutate graph or note state.

## Current migration state

[LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md) exposes configured badges for outer and embedded nodes. [LegacyGraphExpansionBadgeAdapter](LegacyGraphExpansionBadgeAdapter.md) creates the same host-neutral records for nodes that a new expansion will make visible. Normal, parent, and duplicate-node semantics are preserved. `GraphQueries` can return all badges, one badge by stable ID, or the badges belonging to a node.

All current graph-node badge clicks now enter [GraphController](GraphController.md) as stable-ID commands. `O3NodeBadge` knows only how to render and emit one of three intents; it no longer imports Obsidian files, the Obsidian app, or `GraphEngine`. [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md) temporarily implements the output port so expansion behavior remains unchanged.

The older orbiting parent badges and parent-actions overlay use the same `toggle-badge` command. This means normal badges and both parent-specific controls now share one application entry point even though their drawing code has not yet been unified.

## Live visibility policy

The live engine delegates badge visibility decisions to [GraphRenderVisibilityPolicy](GraphRenderVisibilityPolicy.md). Populated badges remain visible on unselected nodes so existing typed relationships are discoverable. Selecting a node or holding the configured show-all key additionally reveals empty configured badges. Marquee and active dragged-node suppression remain unchanged.
