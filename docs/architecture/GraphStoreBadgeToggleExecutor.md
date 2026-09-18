# GraphStoreBadgeToggleExecutor

## Purpose

`GraphStoreBadgeToggleExecutor` is the new host-neutral implementation of [GraphBadgeToggleExecutor](GraphBadgeToggleExecutor.md). It calculates one expand or collapse transition and applies its complete [GraphChangeSet](GraphChangeSet.md) to [GraphStore](GraphStore.md).

Current implementation: [`src/graph-application/GraphStoreBadgeToggleExecutor.ts`](../../src/graph-application/GraphStoreBadgeToggleExecutor.ts)

The class is independently tested. Live badge clicks still use [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md) while the store does not yet own the engine's graph collections.

## Call flow

```text
GraphBadgeTogglePlan
          |
          v
capture GraphStore revision
          |
          v
GraphBadgeToggleTransitionService
          |
          v
GraphChangeSet
          |
          v
GraphStore.applyChangeSet(changeSet, capturedRevision)
```

## Stale-transition protection

Expansion calculation can await note reads. During that wait, another click or selection command may change the graph. Applying the older result would then overwrite state it never observed.

The executor therefore captures the store revision before calculation. Atomic application succeeds only if the revision is unchanged. If it changed, the executor reports `stale-transition` and applies nothing. A caller may create a fresh plan from the current snapshot instead of replaying the old one.

## Result mapping

- Unsupported input becomes `unsupported-plan` without invoking the transition service.
- A typed expansion or collapse calculation failure becomes `transition-failed`.
- A revision mismatch becomes `stale-transition`.
- Another store validation failure becomes `store-rejected`.
- Successful application reports the transition's `expand` or `collapse` effect.

## Connections

- Implements [GraphBadgeToggleExecutor](GraphBadgeToggleExecutor.md).
- Calculates through [GraphBadgeToggleTransitionService](GraphBadgeToggleTransitionService.md).
- Applies [GraphChangeSet](GraphChangeSet.md) objects to [GraphStore](GraphStore.md).
- Will replace [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md) only after the new state path is composed and manually verified.
