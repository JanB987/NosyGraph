# GraphPhysicsCoordinator

## Purpose

`GraphPhysicsCoordinator` joins a [GraphPhysicsEngine](GraphPhysicsEngine.md) to [GraphKinematicsStore](GraphKinematicsStore.md), keeping lifecycle and frame publication outside both components.

Current implementation: [`src/graph-application/GraphPhysicsCoordinator.ts`](../../src/graph-application/GraphPhysicsCoordinator.ts)

The coordinator is dormant and does not start the legacy animation loop.

## Responsibilities

- Load one complete `GraphPhysicsRuntimeInput` into the engine.
- Delegate start, reheat, freeze, resume, and stop commands.
- Reject a stale expected frame sequence before stepping the engine.
- Step the engine only when publication can proceed.
- Reject an engine frame whose structural revision differs from the loaded input.
- Publish accepted output atomically through `GraphKinematicsStore`.

Checking sequence before stepping is important: a rejected caller must not advance hidden engine state and lose an unpublishable frame.

## Connections

- Loads [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) output.
- Controls [GraphPhysicsEngine](GraphPhysicsEngine.md).
- Publishes to [GraphKinematicsStore](GraphKinematicsStore.md).
- Leaves semantic revision ownership with [GraphRuntimeState](GraphRuntimeState.md).

## Next extraction

Create a legacy read adapter that produces host-neutral physics settings, transient constraints, and container candidates without moving live simulation ownership yet.
