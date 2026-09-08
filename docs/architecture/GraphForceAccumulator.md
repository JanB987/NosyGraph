# GraphForceAccumulator

## Purpose

`GraphForceAccumulator` composes pure node-pair repulsion and force-link springs into detached velocity deltas. It never mutates input nodes.

Current implementation: [`src/graph-domain/GraphForceAccumulator.ts`](../../src/graph-domain/GraphForceAccumulator.ts)

## Responsibilities

- Initialize one zero velocity delta per projected node.
- Apply [GraphPairwiseRepulsion](GraphPairwiseRepulsion.md) to eligible node pairs.
- Apply [GraphLinkSpring](GraphLinkSpring.md) to normalized force policies.
- Skip direction-policy edges; their fixed positions are separate behavior.
- Apply [GraphCenterGravity](GraphCenterGravity.md) after pair and spring forces.
- Apply [GraphNodeContainerRepulsion](GraphNodeContainerRepulsion.md) to external eligible nodes and react on independently eligible origins.
- Apply [GraphContainerRepulsion](GraphContainerRepulsion.md) between eligible container pairs and transfer reactions to unlocked origins.
- Isolate nodes across container boundaries unless they share a container.
- Exclude drag, direction-target, and velocity-freeze recipients from force application.
- Preserve legacy behavior by allowing position-lock and persistent-pin bodies to accumulate forces that integration later discards.
- Exclude persistent pins and every transiently constrained node from center gravity because legacy integration returns before centering them.
- Return bounded-category diagnostics without logging.

Optional policy callbacks can further restrict recipients or replace the default container-interaction decision. This keeps eligibility explicit for future parity refinement.

Node-container eligibility preserves a subtle asymmetry: a lens owner may receive the external-node force because legacy integration later freezes it, while an origin that owns a lens cannot receive the reaction. Locks, pins, drags, direction targets, Alt/topology freezes, and dragged lens descendants block both roles.

Container-pair origin transfer has a broader legacy eligibility rule: only a persistent pin, transient position lock, missing origin, or optional caller policy blocks it. Other transient constraints accumulate the reaction and discard it later during integration.

## Connections

- Consumes complete [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) output.
- Uses [GraphPhysicsContainers](GraphPhysicsContainers.md) for isolation membership.
- Uses [GraphPhysicsConstraints](GraphPhysicsConstraints.md) for transient eligibility.
- Produces deltas for a future integration stage in [GraphPhysicsEngine](GraphPhysicsEngine.md).

## Current status

The staged engine now applies integration, confinement, anchoring, and the second confinement pass. Remaining work is live runtime wiring and parity validation.
