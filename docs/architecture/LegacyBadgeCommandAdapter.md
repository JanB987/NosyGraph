# LegacyBadgeCommandAdapter

## Purpose

`LegacyBadgeCommandAdapter` is the temporary bridge between host-neutral [GraphController](GraphController.md) commands and the objects still owned by the large legacy `GraphEngine`.

Current implementation: [`src/graph-application/LegacyBadgeCommandAdapter.ts`](../../src/graph-application/LegacyBadgeCommandAdapter.ts)

It exists so migration code is explicit and testable. It is not intended to become the final expansion service.

## Responsibilities

For a resolved [GraphBadge](GraphBadge.md), the adapter:

1. Finds the current legacy node by `badge.nodeId`.
2. Finds its current host file by `node.sourcePath`.
3. Matches the current link-type definition by normalized `badge.linkTypeId`.
4. Calls the injected toggle, input, or chain operation.

If any legacy object has disappeared between rendering and clicking, the adapter safely performs no operation.

## Generic boundary

```ts
class LegacyBadgeCommandAdapter<TNode, TFile, TLinkType>
  implements GraphBadgeCommandPort
```

The type parameters are deliberate. This class does not import Obsidian `TFile`, `O3LinkType`, or `GraphEngine`. Instead, the engine provides small lookup functions and operations when it constructs the adapter.

## Current flow

```text
GraphBadgeCommand
       |
       v
GraphController
       |
       v
LegacyBadgeCommandAdapter
       | resolve current node, file, link type
       v
injected legacy expansion operation
```

## Connections

- Implements `GraphBadgeCommandPort` from [GraphController](GraphController.md).
- Receives [GraphBadge](GraphBadge.md) read models.
- Temporarily calls legacy behavior that will become [GraphExpansion](GraphExpansion.md) application logic.
- Uses host objects supplied by the future [Obsidian adapters](ObsidianAdapters.md), without importing those objects itself.

## Removal condition

Delete this adapter after expansion ownership, relationship lookup, and graph changes are represented by host-neutral services and [GraphStore](GraphStore.md). At that point `GraphController` can call the real expansion service directly.
