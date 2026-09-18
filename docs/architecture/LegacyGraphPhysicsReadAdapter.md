# LegacyGraphPhysicsReadAdapter

## Purpose

`LegacyGraphPhysicsReadAdapter` is the single facade over the legacy settings, transient-constraint, and container adapters. It creates a request accepted directly by [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md).

Current implementation: [`src/graph-application/LegacyGraphPhysicsReadAdapter.ts`](../../src/graph-application/LegacyGraphPhysicsReadAdapter.ts)

It remains host-neutral and dormant. Its source is copied plain data, never a live `GraphEngine` reference. `GraphEngine.getLegacyPhysicsReadState()` now provides that detached source without redirecting the active simulation.

## Flow

```text
LegacyGraphPhysicsReadState
        | settings    -> LegacyGraphPhysicsSettingsAdapter
        | constraints -> LegacyGraphPhysicsConstraintAdapter
        | containers  -> LegacyGraphPhysicsContainerAdapter
        v
GraphPhysicsRuntimeInputRequest
        v
GraphPhysicsRuntimeInputComposer
```

Adapter-level malformed-entry diagnostics remain separate from snapshot-level projection diagnostics. This distinguishes a malformed legacy record from a valid record referring to a node that has since disappeared.

## Connections

- Composes all three legacy physics adapters.
- Accepts a detached [GraphSnapshotKinematicsComposer](GraphSnapshotKinematicsComposer.md) result plus its version numbers.
- Feeds [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md).
- Does not start [GraphPhysicsCoordinator](GraphPhysicsCoordinator.md) or mutate legacy state.

## Production capture

`GraphEngine.getLegacyPhysicsReadState()` copies:

- Global and active LinkType physics configuration.
- Runtime LinkType overrides.
- Focal locks, pin repositioning, current drag targets, and direction targets.
- Hotkey, topology, Alt-drag, lens-owner, and dragged-descendant freezes.
- Parent and embedded container membership, bounds, origins, and embedded gravity.

The captured state is composed with the semantic snapshot by GraphPhysicsShadowInputService and is available through explicit GraphEngine diagnostics outside the animation loop.
