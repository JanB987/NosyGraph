# GraphBadgeToggleShadowService

## Purpose

`GraphBadgeToggleShadowService` lets the new transition pipeline run during real badge clicks without giving it mutation authority yet.

Current implementation: [`src/graph-application/GraphBadgeToggleShadowService.ts`](../../src/graph-application/GraphBadgeToggleShadowService.ts)

It implements [GraphBadgeToggleExecutor](GraphBadgeToggleExecutor.md) as a decorator around the live [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md). Its returned result is always the legacy executor result.

## Call flow

```text
GraphBadgeTogglePlan
        |
        +---- capture detached GraphSnapshot
        |                  |
        |                  v
        |       calculate new GraphChangeSet
        |                  |
        +---- execute legacy mutation
                           |
                           v
              GraphBadgeToggleShadowComparator
```

The calculation receives a `GraphQueries` instance backed by the captured snapshot. Legacy mutation may proceed while note materialization awaits metadata, but it cannot change the state observed by the shadow calculation.

## Failure isolation

- The calculated [GraphChangeSet](GraphChangeSet.md) is never applied.
- Note-reader and transition exceptions become a `failed` shadow calculation.
- Typed transition failures remain available in the observation.
- Observer exceptions are caught and cannot change the live result.
- The observation contains detached snapshots from immediately before and after legacy execution.
- [GraphBadgeToggleShadowComparator](GraphBadgeToggleShadowComparator.md) applies the calculated change set to the earlier snapshot and compares that expected state with the later snapshot.
- `GraphEngine` logs structured warnings only when comparison is unavailable or semantic graph state differs.

This is a migration tool, not a permanent second state owner. It should be removed when [GraphStoreBadgeToggleExecutor](GraphStoreBadgeToggleExecutor.md) becomes live.

## Connections

- Wraps [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md).
- Composes [GraphExpansionTargetMaterializer](GraphExpansionTargetMaterializer.md), [GraphExpansionTransitionService](GraphExpansionTransitionService.md), and [GraphBadgeToggleTransitionService](GraphBadgeToggleTransitionService.md).
- Reads target notes through [ObsidianGraphExpansionNoteAdapter](ObsidianGraphExpansionNoteAdapter.md).
- Reads configured target-node badges through [LegacyGraphExpansionBadgeAdapter](LegacyGraphExpansionBadgeAdapter.md).
- Supplies observations to [GraphBadgeToggleShadowComparator](GraphBadgeToggleShadowComparator.md).
- Reports diagnostics without applying changes to [GraphStore](GraphStore.md).
- Is exercised by [Badge Toggle Shadow Regression](BadgeToggleShadowRegression.md).
