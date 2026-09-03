# GraphPhysicsEngine

## Purpose

`GraphPhysicsEngine` is the compiled host-neutral port for a graph motion implementation. `DeterministicGraphPhysicsEngine` is a small linear-motion implementation used to test orchestration.

Current implementation: [`src/graph-application/GraphPhysicsEngine.ts`](../../src/graph-application/GraphPhysicsEngine.ts)

Neither is wired into the live animation loop. [GraphPhysicsExperimentRunner](GraphPhysicsExperimentRunner.md) can create the deterministic class for one isolated explicit experiment. It is not intended to replace the characterized legacy force algorithm.

## Contract

```ts
interface GraphPhysicsEngine {
  setInput(input: GraphPhysicsRuntimeInput): void;
  getStatus(): "stopped" | "running" | "frozen";
  start(): void;
  reheat(amount?: number): void;
  freeze(): void;
  resume(): void;
  stop(): void;
  step(deltaTime: number): GraphKinematicsFrameInput;
  setNodePosition(nodeId, point): boolean;
}
```

The engine accepts one complete [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) result and emits an unsequenced frame for [GraphKinematicsStore](GraphKinematicsStore.md) to publish.

## Deterministic implementation

The test implementation:

- Copies input coordinates.
- Advances running nodes by `velocity * deltaTime`.
- Does not move while stopped or frozen.
- Preserves the input structural revision in every frame.
- Returns detached coordinate maps.
- Treats any positive reheat amount as start, matching current orchestration behavior.
- Rejects position commands for unknown node IDs.

It intentionally applies no forces, settings, pins, or containers. Those behaviors belong in a future legacy-parity implementation and its characterization tests.

## Connections

- Consumes [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) output.
- Emits [GraphKinematicsFrame](GraphKinematicsFrame.md) input.
- Is isolated from Obsidian, DOM/canvas rendering, notes, badges, and persistence.
- Must eventually conform to [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).

## Next extraction

[GraphPhysicsCoordinator](GraphPhysicsCoordinator.md) now loads composed input, steps this port, and publishes frames through `GraphKinematicsStore` with sequence and structural-revision protection.
