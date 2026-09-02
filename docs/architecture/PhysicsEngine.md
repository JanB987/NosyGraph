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
- Publishes [GraphKinematicsFrame](GraphKinematicsFrame.md) values to [GraphKinematicsStore](GraphKinematicsStore.md).
- Supplies independently sequenced motion for [GraphRenderer](GraphRenderer.md) without advancing structural graph revisions.
- Honors [GraphContainer](GraphGroupAndContainer.md) isolation without knowing group or note semantics.

[GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) separates rapidly changing kinematics frames from the structural revision used to guard asynchronous graph transitions.

The frame and owner now exist as dormant, tested architecture. The legacy physics loop is not connected to them yet.

## Must not know

- Note paths or frontmatter
- Obsidian APIs
- Badges and menus
- Canvas elements
- Persistence formats
