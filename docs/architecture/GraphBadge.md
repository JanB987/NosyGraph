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

1. The temporary `O3NodeBadge` DOM wrapper emits a badge intent.
2. [GraphController](GraphController.md) resolves the command.
3. `GraphBadgeCommandPort` delegates to the matching legacy expansion operation.
4. A later extraction will move that operation into [GraphExpansion](GraphExpansion.md) functions and apply its result to [GraphStore](GraphStore.md).

The badge itself does not mutate graph or note state.

## Current migration state

`LegacyGraphSnapshotAdapter` exposes configured badges for outer and embedded nodes. Normal, parent, and duplicate-node semantics are preserved. `GraphQueries` can return all badges, one badge by stable ID, or the badges belonging to a node.

Standard graph-node badge clicks now enter [GraphController](GraphController.md) as stable-ID commands. `O3NodeBadge` knows only how to render and emit one of three intents; it no longer imports Obsidian files, the Obsidian app, or `GraphEngine`. The legacy engine temporarily implements the output port so expansion behavior remains unchanged.

The older parent-overlay badge buttons still call their legacy handler directly. They are tracked as the next small migration step rather than being mixed into this DOM-wrapper change.
