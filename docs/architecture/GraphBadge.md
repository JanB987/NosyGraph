# GraphBadge

## Purpose

`GraphBadge` describes one link-type expansion control attached to a [GraphNodeInstance](GraphNodeInstance.md).

## Core data

```ts
interface GraphBadge {
  id: BadgeId;
  nodeId: NodeInstanceId;
  linkTypeId: LinkTypeId;
  label: string;
  color: string;
  state: "collapsed" | "expanded" | "loading";
  hasRelationships: boolean;
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

