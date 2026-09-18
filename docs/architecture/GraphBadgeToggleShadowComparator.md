# GraphBadgeToggleShadowComparator

## Purpose

`GraphBadgeToggleShadowComparator` determines whether a calculated new transition describes the semantic graph state actually produced by legacy badge execution.

Current implementation: [`src/graph-application/GraphBadgeToggleShadowComparator.ts`](../../src/graph-application/GraphBadgeToggleShadowComparator.ts)

The comparator is diagnostic only. It neither executes a plan nor changes either snapshot.

## Comparison process

1. Receive the before/after observation from [GraphBadgeToggleShadowService](GraphBadgeToggleShadowService.md).
2. Apply the calculated [GraphChangeSet](GraphChangeSet.md) to a temporary [GraphStore](GraphStore.md) initialized from the before snapshot.
3. Compare that expected snapshot with the snapshot captured immediately after legacy execution.
4. Return structured differences grouped by collection and entity identity.

## Compared semantics

- Notes: path, display name, availability, frontmatter properties, configured size, and icon.
- Nodes: note identity, graph context, and ownership origin.
- Edges: endpoints, LinkType, context, and origin.
- Badges: identity, presentation-independent behavior fields, state, and expansion identity.
- Expansions: source identity and sorted node, edge, and child-expansion ownership.

Node position, velocity, and radius are ignored. Physics and connection-based sizing may change those values during the operation, so treating them as architectural differences would create false alarms.

## Difference kinds

- `missing-after-legacy`: calculated state expected an entity that legacy state does not contain.
- `unexpected-after-legacy`: legacy state contains an entity absent from calculated state.
- `value-mismatch`: both states contain the identity but differ in listed semantic fields.

The result is `not-comparable` when shadow calculation throws, transition calculation rejects the plan, legacy execution does not apply it, or the calculated change set cannot form a valid expected store state.

## Connections

- Consumes observations from [GraphBadgeToggleShadowService](GraphBadgeToggleShadowService.md).
- Uses [GraphStore](GraphStore.md) to materialize expected state atomically.
- Compares [GraphNote](GraphNote.md), [GraphNodeInstance](GraphNodeInstance.md), [GraphEdge](GraphEdgeAndLinkType.md), [GraphBadge](GraphBadge.md), and [GraphExpansion](GraphExpansion.md) records.
- Reports migration gaps to the current engine without affecting live behavior.
- Is manually verified through [Badge Toggle Shadow Regression](BadgeToggleShadowRegression.md).
