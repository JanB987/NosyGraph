# LegacyGraphBadgeToggleExecutor

## Purpose

`LegacyGraphBadgeToggleExecutor` applies host-neutral plans through the current legacy toggle operation while protecting the requested state.

Current implementation: [`src/graph-application/LegacyGraphBadgeToggleExecutor.ts`](../../src/graph-application/LegacyGraphBadgeToggleExecutor.ts)

It implements [GraphBadgeToggleExecutor](GraphBadgeToggleExecutor.md) without importing Obsidian, `GraphEngine`, or `O3LinkType`.

## Injected dependencies

```ts
getNode(nodeId);
getFile(sourcePath);
getLinkTypes(node);
normalizeLinkType(value);
isExpanded(expansionId);
toggle(target);
```

Generic node, file, and link-type parameters retain their real runtime types for the injected legacy operation.

## Execution flow

1. Reject unsupported plans.
2. Compare the plan effect with current expansion state.
3. Return `unchanged` if the effect is already present.
4. Resolve node, source file, and normalized link type.
5. Verify the legacy node still represents `plan.sourceNoteId`.
6. Invoke the existing toggle exactly once.
7. Return an explicit applied result.

## Why state is checked first

The existing legacy operation is a toggle, not separate expand and collapse functions. Without the state check, a delayed or repeated expand plan could perform the opposite operation.

## Current migration state

The executor is composed with planning by [GraphBadgeToggleHandler](GraphBadgeToggleHandler.md) and now applies live normal link-badge toggle plans. Its injected operation is still the existing legacy toggle, preserving graph mutation and persistence behavior during this migration stage.

## Removal condition

Remove this executor after graph expansion and collapse are expressed as change sets applied directly to [GraphStore](GraphStore.md).
