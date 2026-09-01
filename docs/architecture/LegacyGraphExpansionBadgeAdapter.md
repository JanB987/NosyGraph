# LegacyGraphExpansionBadgeAdapter

## Purpose

`LegacyGraphExpansionBadgeAdapter` creates [GraphBadge](GraphBadge.md) records for a node that the new expansion pipeline is about to make visible.

Current implementation: [`src/graph-application/LegacyGraphExpansionBadgeAdapter.ts`](../../src/graph-application/LegacyGraphExpansionBadgeAdapter.ts)

The adapter implements the narrow `GraphExpansionBadgeReader` port from [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md). It receives host-neutral definitions rather than legacy `O3LinkType` or Obsidian objects.

## Inputs

For each graph context, the current engine supplies definitions containing:

- Stable LinkType identity.
- Badge label and normalized color.
- Link or parent semantics.
- Duplicate-node behavior.

A second callback reports whether the target note currently has relationships for that LinkType.

## Output rules

- Badge identity is created with `createGraphBadgeId(nodeId, linkTypeId)`.
- New target-node badges always begin collapsed and have no expansion identity.
- Definitions are deduplicated by LinkType identity.
- Empty LinkType identities are ignored.
- Root and embedded contexts can supply different configured definitions.

If the target node already exists in the captured snapshot, the materializer does not call this adapter. Existing badges remain owned by the snapshot and are not redundantly upserted.

## Connections

- Implements `GraphExpansionBadgeReader` for [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md).
- Produces [GraphBadge](GraphBadge.md) records included by [GraphExpansionChangeSet](GraphExpansionChangeSet.md).
- Is composed into [GraphBadgeToggleShadowService](GraphBadgeToggleShadowService.md).
- Will be replaced by a non-legacy LinkType configuration reader when configuration ownership leaves `GraphEngine`.
