# PhysicsEngine

## Purpose

`PhysicsEngine` evolves positions for graph bodies. It is host-neutral and rendering-neutral.

## Proposed contract

```ts
interface PhysicsEngine {
  setGraph(input: GraphPhysicsInput): void;
  updateSettings(settings: PhysicsSettings): void;
  start(): void;
  reheat(amount?: number): void;
  freeze(): void;
  resume(): void;
  stop(): void;
  step(deltaTime: number): GraphKinematicsFrameInput;
  setNodePosition(nodeId: NodeInstanceId, point: Point): void;
  setNodePinned(nodeId: NodeInstanceId, pinned: boolean): void;
}
```

## Connections

- Receives [GraphPhysicsInput](GraphPhysicsInput.md) from [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md).
- Returns [GraphKinematicsFrame](GraphKinematicsFrame.md) inputs for publication by [GraphKinematicsStore](GraphKinematicsStore.md).
- Supplies independently sequenced motion for [GraphRenderer](GraphRenderer.md) without advancing structural graph revisions.
- Honors [GraphContainer](GraphGroupAndContainer.md) isolation without knowing group or note semantics.

[GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) separates rapidly changing kinematics frames from the structural revision used to guard asynchronous graph transitions.

The frame owner, snapshot composer, and input projector now exist as dormant, tested architecture. The legacy physics loop is not connected to them yet.

## Must not know

- Note paths or frontmatter
- Obsidian APIs
- Badges and menus
- Canvas elements
- Persistence formats
