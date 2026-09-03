# GraphForceAccumulator

## Purpose

`GraphForceAccumulator` composes pure node-pair repulsion and force-link springs into detached velocity deltas. It never mutates input nodes.

Current implementation: [`src/graph-domain/GraphForceAccumulator.ts`](../../src/graph-domain/GraphForceAccumulator.ts)

## Responsibilities

- Initialize one zero velocity delta per projected node.
- Apply [GraphPairwiseRepulsion](GraphPairwiseRepulsion.md) to eligible node pairs.
- Apply [GraphLinkSpring](GraphLinkSpring.md) to normalized force policies.
- Skip direction-policy edges; their fixed positions are separate behavior.
- Isolate nodes across container boundaries unless they share a container.
- Exclude drag, direction-target, and velocity-freeze recipients from force application.
- Preserve legacy behavior by allowing position-lock and persistent-pin bodies to accumulate forces that integration later discards.
- Return bounded-category diagnostics without logging.

Optional policy callbacks can further restrict recipients or replace the default container-interaction decision. This keeps eligibility explicit for future parity refinement.

## Connections

- Consumes complete [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) output.
- Uses [GraphPhysicsContainers](GraphPhysicsContainers.md) for isolation membership.
- Uses [GraphPhysicsConstraints](GraphPhysicsConstraints.md) for transient eligibility.
- Produces deltas for a future integration stage in [GraphPhysicsEngine](GraphPhysicsEngine.md).

## Next extraction

[GraphCenterGravity](GraphCenterGravity.md) now defines pure world and embedded gravity. The next extraction adds it to accumulation before implementing damping and integration.
