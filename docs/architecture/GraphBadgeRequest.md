# GraphBadgeRequest

## Purpose

`GraphBadgeRequest` is the host-neutral, serializable input for badge behavior after [GraphController](GraphController.md) has resolved a UI command.

Current implementation: [`src/graph-application/GraphBadgeRequest.ts`](../../src/graph-application/GraphBadgeRequest.ts)

The UI command initially contains only an action and badge ID. The request adds the graph identities needed by future expansion services without exposing Obsidian or legacy runtime objects.

## Data

```ts
interface GraphBadgeRequest {
  action: "toggle-badge" | "open-badge-input" | "expand-badge-chain";
  badgeId: BadgeId;
  nodeId: NodeInstanceId;
  noteId: NoteId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  semantic: "link" | "parent";
}
```

The distinction between `nodeId` and `noteId` matters. Duplicate and embedded node instances can visualize the same note while requiring different expansion ownership and graph contexts.

## Construction

```ts
createGraphBadgeRequest(action, badge, node): GraphBadgeRequest | undefined;
```

The factory refuses to combine a badge and node whose runtime IDs do not match. [GraphController](GraphController.md) also returns `node-not-found` if the node disappeared after the badge was rendered.

## Connections

- Built from [GraphBadge](GraphBadge.md) and [GraphNodeInstance](GraphNodeInstance.md) read models.
- Created by [GraphController](GraphController.md).
- Passed through `GraphBadgeCommandPort`.
- Consumed temporarily by [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md).
- Will become the input to extracted [GraphExpansion](GraphExpansion.md) behavior.

## Must not contain

- Obsidian `App` or `TFile`
- DOM or canvas elements
- `GraphEngine` nodes or link-type objects
- Mutable graph collections
