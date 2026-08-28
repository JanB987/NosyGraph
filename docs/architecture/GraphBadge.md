# GraphBadge

## Purpose

`GraphBadge` describes one link-type expansion control attached to a [GraphNodeInstance](GraphNodeInstance.md).

Current read model: [`src/graph-domain/GraphBadge.ts`](../../src/graph-domain/GraphBadge.ts)

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
getBadgeId(nodeId, linkTypeId): BadgeId;
```

## Click flow

1. [GraphRenderer](GraphRenderer.md) emits `BadgeClickedIntent`.
2. [GraphController](GraphController.md) resolves the command.
3. [GraphExpansion](GraphExpansion.md) functions calculate the change.
4. [GraphStore](GraphStore.md) applies the result.

The badge itself does not mutate graph or note state.

## Current migration state

`LegacyGraphSnapshotAdapter` exposes configured badges for outer and embedded nodes. Normal, parent, and duplicate-node semantics are preserved. `GraphQueries` can return all badges, one badge by stable ID, or the badges belonging to a node.

Badge clicks still enter the legacy `GraphEngine` directly. Moving that interaction behind [GraphController](GraphController.md) is a separate step because it changes command flow rather than read-only data.
