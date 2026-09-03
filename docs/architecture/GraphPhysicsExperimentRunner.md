# GraphPhysicsExperimentRunner

## Purpose

`GraphPhysicsExperimentRunner` runs one replacement-engine step against a detached [GraphPhysicsShadowInputService](GraphPhysicsShadowInputService.md) capture.

Current implementation: [`src/graph-application/GraphPhysicsExperimentRunner.ts`](../../src/graph-application/GraphPhysicsExperimentRunner.ts)

## Isolation rules

- Create a fresh [GraphPhysicsEngine](GraphPhysicsEngine.md) for every experiment.
- Load only detached runtime input.
- Start, step once, and stop the experiment engine.
- Stamp the returned [GraphKinematicsFrame](GraphKinematicsFrame.md) with the caller's sequence.
- Return the detached frame plus compact input and frame summaries.
- Never publish to [GraphKinematicsStore](GraphKinematicsStore.md), render, mutate legacy nodes, or reuse experiment state.

The default engine is `DeterministicGraphPhysicsEngine`, which tests orchestration through linear motion. It is not a force-parity implementation.

## Connections

- Reads via the same capture port as [GraphPhysicsShadowSampleService](GraphPhysicsShadowSampleService.md).
- Summarizes with [GraphPhysicsShadowDiagnostics](GraphPhysicsShadowDiagnostics.md) and [GraphKinematicsFrameDiagnostics](GraphKinematicsFrameDiagnostics.md).
- Accepts an injected engine factory for future parity implementations.

## Next extraction

[GraphKinematicsFrameComparator](GraphKinematicsFrameComparator.md) compares experiment output with a copied legacy frame. The next extraction composes both behind one explicit parity service.
