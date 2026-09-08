# LegacyGraphRelationshipTargetAdapter

## Purpose

`LegacyGraphRelationshipTargetAdapter` converts the current relationship resolver into [GraphRelationshipTargetReader](GraphRelationshipTargetReader.md) results.

Current implementation: [`src/graph-application/LegacyGraphRelationshipTargetAdapter.ts`](../../src/graph-application/LegacyGraphRelationshipTargetAdapter.ts)

Like [LegacyBadgeCommandAdapter](LegacyBadgeCommandAdapter.md), it is a temporary migration seam. It is generic and does not import Obsidian or `GraphEngine`.

## Injected dependencies

```ts
getSource(noteId): TSource | undefined;
getLinkType(linkTypeId): TLinkType | undefined;
resolveTargets(source, linkType): readonly LegacyRelationshipTarget[];
```

Each dependency may also be asynchronous. This lets a later repository implementation keep the same application contract.

## Translation rules

- Legacy `path` becomes host-neutral `noteId`.
- The first occurrence of a target wins.
- Empty targets, duplicate targets, and self-links are removed.
- Missing-note status is preserved.
- An empty label falls back to the canonical note ID.
- Missing source notes or link types return an empty result.

## Current migration state

The live normal badge planner now uses [ObsidianRelationshipTargetReader](ObsidianAdapters.md). This adapter remains a tested compatibility seam for callers that still provide a legacy source and resolver.

## Removal condition

Remove this adapter when an Obsidian note/link-type repository directly implements [GraphRelationshipTargetReader](GraphRelationshipTargetReader.md).
