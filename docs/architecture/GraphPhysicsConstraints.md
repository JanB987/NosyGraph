# GraphPhysicsConstraints

## Purpose

`GraphPhysicsConstraintState` describes why physics may not freely move a node. It keeps persisted user pin intent separate from temporary runtime conditions.

Current implementation: [`src/graph-domain/GraphPhysicsConstraints.ts`](../../src/graph-domain/GraphPhysicsConstraints.ts)

These host-neutral types are dormant. They do not yet replace legacy `isPinned`, `isLocked`, drag sets, or freeze flags.

## State shape

```ts
interface GraphPhysicsConstraintState {
  simulationFrozen: boolean;
  persistentPins: readonly GraphPersistentPinConstraint[];
  transientNodeConstraints: readonly GraphTransientNodeConstraint[];
}
```

A persistent pin carries the node ID and persisted position. Transient constraints use explicit variants:

- `position-lock` for focal locking or repositioning a pin.
- `drag-target` for active pointer movement.
- `direction-target` for direction-based LinkType placement.
- `velocity-freeze` for topology updates, Alt-drag, lens owners, or dragged lens descendants.

The same node can have both a persistent pin and transient constraint. Keeping arrays separate prevents a temporary unlock from erasing persisted user intent.

Whole-simulation freeze is separate because the legacy hotkey pauses integration without converting every node into a pin or clearing velocity.

## Copy function

```ts
copyGraphPhysicsConstraintState(state): GraphPhysicsConstraintState;
```

The function copies arrays and coordinate objects so input producers, physics, and consumers cannot share mutable positions accidentally.

## Connections

- Complements [GraphPhysicsInput](GraphPhysicsInput.md) and [GraphPhysicsSettings](GraphPhysicsSettings.md).
- Will be interpreted by [PhysicsEngine](PhysicsEngine.md).
- Persistent pins originate in semantic graph state and persistence.
- Transient constraints originate in [GraphController](GraphController.md), renderer intents, direction layout, and topology coordination.
- The observed legacy mapping is recorded in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).
- [LegacyGraphPhysicsConstraintAdapter](LegacyGraphPhysicsConstraintAdapter.md) translates current runtime collections into these variants.

## Constraint projection

GraphPhysicsConstraintProjector now derives persistent pins and detached transient constraints. Container membership and boundary constraints are supplied by the companion container projector.
