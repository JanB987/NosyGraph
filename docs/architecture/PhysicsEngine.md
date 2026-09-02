# PhysicsEngine

## Purpose

`PhysicsEngine` evolves positions for graph bodies. It is host-neutral and rendering-neutral.

## Proposed contract

```ts
interface PhysicsEngine {
  setGraph(nodes: readonly PhysicsNode[], edges: readonly PhysicsEdge[]): void;
  updateSettings(settings: PhysicsSettings): void;
  start(): void;
  reheat(amount?: number): void;
  freeze(): void;
  resume(): void;
  stop(): void;
  step(deltaTime: number): PhysicsFrame;
  setNodePosition(nodeId: NodeInstanceId, point: Point): void;
  setNodePinned(nodeId: NodeInstanceId, pinned: boolean): void;
}
```

## Connections

- Receives physics projections of [GraphStore](GraphStore.md) snapshots.
- Returns positions that [GraphController](GraphController.md) can apply to the store.
- Supplies frames for [GraphRenderer](GraphRenderer.md).
- Honors [GraphContainer](GraphGroupAndContainer.md) isolation without knowing group or note semantics.

[GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) separates rapidly changing kinematics frames from the structural revision used to guard asynchronous graph transitions.

## Must not know

- Note paths or frontmatter
- Obsidian APIs
- Badges and menus
- Canvas elements
- Persistence formats
