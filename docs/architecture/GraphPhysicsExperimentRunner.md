# GraphPhysicsExperimentRunner

## Purpose

[GraphPhysicsExperimentRunner](../../src/graph-application/GraphPhysicsExperimentRunner.ts) runs replacement-engine experiments against detached [GraphPhysicsShadowInputService](GraphPhysicsShadowInputService.md) captures.

## One-step and trace runs

- run(frameSequence, deltaTime) captures input once, starts a fresh engine, performs one step, and returns one detached frame.
- runSteps(frameSequence, deltaTime, stepCount) captures input once, retains one engine for the requested number of steps, and returns a sequenced trace.
- Trace frame sequences start at the supplied frameSequence and increment once per step.
- The engine is stopped and discarded after the run; no experiment state is reused.

A trace therefore tests evolution from one identical starting state. It does not recapture the live graph between steps.

## Connections

- The default engine remains DeterministicGraphPhysicsEngine for orchestration tests.
- Controlled parity tests inject StagedGraphPhysicsEngine.
- [GraphKinematicsTraceComparator](GraphKinematicsTraceComparator.md) compares trace output with synchronized expected legacy frames.
- The runner never publishes, renders, mutates legacy nodes, or logs.
