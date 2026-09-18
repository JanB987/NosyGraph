# LegacyBadgeCommandAdapter

## Purpose

`LegacyBadgeCommandAdapter` is the temporary bridge between host-neutral [GraphController](GraphController.md) commands and the objects still owned by the large legacy `GraphEngine`.

Current implementation: [`src/graph-application/LegacyBadgeCommandAdapter.ts`](../../src/graph-application/LegacyBadgeCommandAdapter.ts)

It exists so migration code is explicit and testable. It is not intended to become the final expansion service.

## Responsibilities

For a resolved [GraphBadgeRequest](GraphBadgeRequest.md), the adapter:

1. Sends normal link-type toggle requests to [GraphBadgeToggleHandler](GraphBadgeToggleHandler.md).
2. For parent, input, and chain requests, finds the current legacy node by `request.nodeId`.
3. Finds its current host file by `node.sourcePath`.
4. Matches the current link-type definition by normalized `request.linkTypeId`.
5. Dispatches the remaining action to its injected legacy operation.

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
GraphBadgeRequest
       |
       v
LegacyBadgeCommandAdapter
       |
       +---- normal link toggle ----> GraphBadgeToggleHandler
       |
       +---- parent/input/chain ----> injected legacy operation
```

## Connections

- Implements `GraphBadgeCommandPort` from [GraphController](GraphController.md).
- Receives host-neutral [GraphBadgeRequest](GraphBadgeRequest.md) values.
- Temporarily calls legacy behavior that will become [GraphExpansion](GraphExpansion.md) application logic.
- Uses host objects supplied by the future [Obsidian adapters](ObsidianAdapters.md), without importing those objects itself.

## Removal condition

Delete this adapter after expansion ownership, relationship lookup, and graph changes are represented by host-neutral services and [GraphStore](GraphStore.md). At that point `GraphController` can call the real expansion service directly.
