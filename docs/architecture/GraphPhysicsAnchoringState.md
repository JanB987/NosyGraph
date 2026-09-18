# GraphPhysicsAnchoringState

## Purpose

[`GraphPhysicsAnchoringState`](../../src/graph-domain/GraphPhysicsAnchoringState.ts) carries the detached seed and current runtime state for [GraphContainerAnchoring](GraphContainerAnchoring.md). It contains a container-ID map of anchor records, a node-ID map of effective fixed coordinates, and the captured minimum viewport size.

The minimum comes from `max(44, legacy baseNodeRadius * 2.2)`. Container geometry, individual node radii, and influence-distance floors do not reliably recover the base radius. Origin history and anchor directions must also be supplied explicitly.

## Ownership and initialization

`GraphPhysicsRuntimeInput.anchoring` is optional so existing shadow captures and other engine implementations remain usable. [StagedGraphPhysicsEngine](StagedGraphPhysicsEngine.md) requires a complete seed for positive running steps with containers. Inspection, stopped, and frozen steps do not require or advance it. Missing entries or an invalid viewport minimum reject stepping before the force stages run.

'setInput' reconciles a new detached projection with the current runtime. A container keeps its evolving bounds, direction, and origin history when its stable ID, kind, and origin node remain compatible. Membership and source bounds may change without resetting that runtime geometry. New containers require a seed. A kind or origin change resets the container from its new seed; a removed container is pruned. Runtime bounds take precedence over compatibility container bounds from the first force stage onward.

The motion frame is reconciled by node ID as well: surviving nodes keep their current positions and velocities, while new nodes use the incoming projection. The structural revision is replaced by the new input revision. This keeps anchor history aligned with the motion it describes during topology updates.

Fixed coordinates are reconciled independently of container ownership. Surviving node IDs keep their current effective coordinates; new node IDs use supplied coordinates; removed node IDs are pruned. Removing all containers therefore does not erase fixed coordinates for surviving nodes.

'getAnchoringState()' and 'getAnchoringReconciliation()' return detached inspection copies. A caller that needs a complete reset can create a new engine instance; 'setInput' is an update/reconciliation operation once the engine has state.

`copyGraphPhysicsAnchoringState()` copies maps and all nested bounds, history, vectors, and fixed-coordinate records. Frame structural revision comes from the enclosing input; this state has no independent revision or sequence counter.

## Fixed coordinates and constraints

Effective `fx`/`fy` values are retained and translated independently per finite axis. They are not automatically substituted into pin positions, lock positions, direction targets, or drag targets. The inspected legacy integration uses separate lock coordinates; anchoring translates `fx`/`fy`, not those locks. Rewriting every constraint would introduce a behavior change.

The staged integration tests cover state carry-forward, independent pin targets, detached inspection, structural revision updates, compatible membership changes, changed origins/kinds, added and removed containers, fixed-coordinate pruning, and incomplete seeds. Broader constraint/host-event reconciliation remains later work.

## Capture limitation

[GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) and the legacy read adapters do not yet capture this seed. Explicit experimental callers can attach it to the composed input. Automatic legacy capture and dynamic container synchronization remain later increments. Positive staged experiments with an unseeded container input fail explicitly; zero-step inspection remains available. This is not a live solver cutover.
