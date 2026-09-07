# GraphPhysicsAnchoringState

## Purpose

[`GraphPhysicsAnchoringState`](../../src/graph-domain/GraphPhysicsAnchoringState.ts) carries the detached seed and current runtime state for [GraphContainerAnchoring](GraphContainerAnchoring.md). It contains a container-ID map of anchor records, a node-ID map of effective fixed coordinates, and the captured minimum viewport size.

The minimum comes from `max(44, legacy baseNodeRadius * 2.2)`. Container geometry, individual node radii, and influence-distance floors do not reliably recover the base radius. Origin history and anchor directions must also be supplied explicitly.

## Ownership and initialization

`GraphPhysicsRuntimeInput.anchoring` is optional so existing shadow captures and other engine implementations remain usable. [StagedGraphPhysicsEngine](StagedGraphPhysicsEngine.md) requires a complete seed for positive running steps with containers. Inspection, stopped, and frozen steps do not require or advance it. Missing entries or an invalid viewport minimum reject stepping before the force stages run.

`setInput` detaches the seed and starts a new simulation from it. Runtime bounds take precedence over compatibility container bounds from the first force stage onward. Repeated `step` calls retain updated bounds, history, and fixed coordinates. `getAnchoringState()` returns a detached inspection copy. A new `setInput` replaces all previous simulation state, even at the same structural revision; it is not yet a topology-reconciliation operation.

`copyGraphPhysicsAnchoringState()` copies maps and all nested bounds, history, vectors, and fixed-coordinate records. Frame structural revision comes from the enclosing input; this state has no independent revision or sequence counter.

## Fixed coordinates and constraints

Effective `fx`/`fy` values are retained and translated independently per finite axis. They are not automatically substituted into pin positions, lock positions, direction targets, or drag targets. The inspected legacy integration uses separate lock coordinates; anchoring translates `fx`/`fy`, not those locks. Rewriting every constraint would introduce a behavior change.

The staged integration tests cover state carry-forward, independent pin targets, detached inspection, and full input replacement. Broader constraint/host-event reconciliation remains A4 work.

## Capture limitation

[GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) and the legacy read adapters do not yet capture this seed. Explicit experimental callers can attach it to the composed input. Automatic legacy capture and dynamic container synchronization remain later increments. Positive staged experiments with an unseeded container input fail explicitly; zero-step inspection remains available. This is not a live solver cutover.
