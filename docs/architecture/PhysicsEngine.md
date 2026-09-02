# PhysicsEngine

## Purpose

`PhysicsEngine` evolves positions for graph bodies. It is host-neutral and rendering-neutral.

## Proposed contract

```ts
interface PhysicsEngine {
  setGraph(input: GraphPhysicsInput): void;
  updateSettings(settings: GraphPhysicsSettings): void;
  updateConstraints(constraints: GraphPhysicsConstraintState): void;
  updateContainers(containers: GraphPhysicsContainerState): void;
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

The complete `setGraph`, settings, and constraint data is assembled by [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md). The next increment turns this proposed interface into a compiled, tested contract.

## Connections

- Receives [GraphPhysicsInput](GraphPhysicsInput.md) from [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md).
- Uses normalized global and LinkType policy from [GraphPhysicsSettings](GraphPhysicsSettings.md).
- Applies persistent and transient movement rules from [GraphPhysicsConstraints](GraphPhysicsConstraints.md).
- Applies membership, boundary, and embedded-gravity rules from [GraphPhysicsContainers](GraphPhysicsContainers.md).
- Returns [GraphKinematicsFrame](GraphKinematicsFrame.md) inputs for publication by [GraphKinematicsStore](GraphKinematicsStore.md).
- Supplies independently sequenced motion for [GraphRenderer](GraphRenderer.md) without advancing structural graph revisions.
- Honors [GraphContainer](GraphGroupAndContainer.md) isolation without knowing group or note semantics.

[GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) separates rapidly changing kinematics frames from the structural revision used to guard asynchronous graph transitions.

The frame owner, snapshot composer, and input projector now exist as dormant, tested architecture. The legacy physics loop is not connected to them yet.

[Legacy Physics Characterization](LegacyPhysicsCharacterization.md) records the exact current defaults, force precedence, direction targets, container isolation, pins, transient locks, freeze behavior, and settling rules that an implementation must preserve or deliberately supersede.

## Must not know

- Note paths or frontmatter
- Obsidian APIs
- Badges and menus
- Canvas elements
- Persistence formats
