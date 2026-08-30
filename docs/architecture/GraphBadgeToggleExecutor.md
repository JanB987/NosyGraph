# GraphBadgeToggleExecutor

## Purpose

`GraphBadgeToggleExecutor` is the application boundary for applying a previously validated [GraphBadgeTogglePlan](GraphBadgeTogglePlan.md).

Current implementation: [`src/graph-application/GraphBadgeToggleExecutor.ts`](../../src/graph-application/GraphBadgeToggleExecutor.ts)

Planning and execution are separate so relationship reading and decision logic remain testable without mutating the graph.

## API

```ts
interface GraphBadgeToggleExecutor {
  execute(plan: GraphBadgeTogglePlan): Promise<GraphBadgeToggleExecutionResult>;
}
```

## Results

- `applied`: expansion or collapse was performed.
- `unchanged`: the requested state was already active.
- `rejected`: the plan was unsupported or its runtime target could not be resolved.

An unchanged result is important for asynchronous command flow. Replaying an expand plan must not accidentally toggle an already-expanded badge back to collapsed.

## Required guarantees

1. Apply `expand` only while the expansion is absent.
2. Apply `collapse` only while the expansion is present.
3. Never execute an `unsupported` plan.
4. Resolve targets from explicit plan identities rather than parsing `badgeId`.
5. Report the outcome instead of silently hiding missing runtime state.

## Connections

- Receives plans through [GraphBadgeToggleHandler](GraphBadgeToggleHandler.md).
- Is temporarily implemented by [LegacyGraphBadgeToggleExecutor](LegacyGraphBadgeToggleExecutor.md).
- A future implementation will apply change sets to [GraphStore](GraphStore.md).

## Must not decide

- Which relationships are targets
- Whether a badge should expand or collapse
- Parent-badge semantics
- UI rendering or physics
