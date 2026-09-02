# Legacy Physics Characterization

## Purpose

This document records the behavior of the live custom physics loop in [`src/GraphEngine.ts`](../../src/GraphEngine.ts) before extracting settings or activating [GraphPhysicsInput](GraphPhysicsInput.md).

It is a parity reference, not a proposed design. Some current rules may later be deliberately changed, but they must not disappear accidentally during refactoring.

## Live call flow

```text
settings, topology, drag, or unpin event
                  |
                  v
           startSimulation()
                  |
                  v
       requestAnimationFrame loop
                  |
                  v
              simulate()
                  |
                  v
       simulateForceLayout()
          |       |       |
          |       |       +--> integrate, damp, constrain
          |       +----------> link springs / direction targets
          +------------------> node and container repulsion
```

The declared alternative layout currently falls back to the same force implementation.

## Global settings and defaults

| Value | Live default | Observed use |
|---|---:|---|
| `repulsionStrength` | `4000` | Node-node, node-container, and container-container repulsion |
| `centerStrength` | `0` | Pulls ordinary nodes toward world origin |
| `nodeRadius` | `6` | Base radius and several container/lens calculations |
| `nodeConnectionSizeMultiplier` | `1` | Grows effective radius by connection count |
| `nearRestVelocityThreshold` | `0.08` | Switches from 16 ms to 50 ms target frame interval |
| `restVelocityThreshold` | `0.015` | Determines settling and several motion dead zones |
| `damping` | `0.85` | Multiplies velocity before integration; currently hard-coded |
| default link distance | `120` | Spring gap when no type value applies |
| default link strength | `0.01` | Spring coefficient when no type value applies |
| settled frames | `24` | Consecutive slow frames required before stopping |

`textFadeThreshold` is currently bundled into `GraphSimulationSettings`, but it is rendering behavior rather than physics behavior.

## Effective node radius

Physics does not simply use the configured base radius.

1. A valid frontmatter node size wins.
2. Otherwise radius is `nodeRadius + connectionCount * nodeConnectionSizeMultiplier`.
3. The result is clamped between `nodeRadius` and `max(nodeRadius, 96)`.
4. Every edge contributes to connection count, including overlay edges that do not create springs.

Effective radius changes repulsion boundary distance, spring boundary gap, container bounds, and several lens calculations. The new `GraphPhysicsNode.radius` must therefore receive the already-resolved effective value.

The legacy `mass` field is initialized but is not read by the current custom force loop.

## Link-force resolution

Overlay edges are skipped by both direction-target calculation and link springs. Other edges are skipped when an endpoint is missing or the endpoints are separated by a container boundary.

For a force-based edge, values are selected in this order:

1. Active LinkType-note configuration.
2. Runtime/persisted `linkTypePhysics` configuration.
3. Engine defaults (`120` distance and `0.01` strength).

Distance is clamped to `20..800`; strength is clamped to `0.001..0.3`. Spring force uses the gap between node boundaries, not center-to-center distance, and is clamped to `-5..5`.

Important parity question: `O3LinkType` supplies finite defaults for force-based definitions, so the active LinkType layer commonly wins even when a runtime value exists. The next normalizer must encode current precedence explicitly; changing it requires a separate product decision and regression test.

## Direction-based relationships

Direction-based LinkTypes create fixed target positions instead of ordinary spring movement.

- Supported placements are right, left, down, and up; other values become right.
- Axis spacing is made positive and zero becomes `120` during registration.
- A root source keeps its current position.
- Single-parent siblings are distributed perpendicular to the configured direction.
- Multi-parent children use the outer parent coordinate and a grid-rounded midpoint.
- Occupied target positions are shifted by one axis interval.
- Unresolved cycles keep their current position.
- Direction-target nodes have velocity zeroed and are assigned their solved position during integration.

The LinkType parser currently defaults `linkDirection` to `outgoing`, `linkXAxis` to `0`, and `linkYAxis` to `1`; runtime normalization consequently treats the direction as right and turns the zero X spacing into `120`.

## Pinning and transient locks

Persistent pinning is broader than a boolean physics input:

- Pinning copies the current position into `fx/fy` and `lockX/lockY`.
- It zeroes velocity and sets both `isPinned` and `isLocked`.
- The custom loop enforces `isLocked` and `lockX/lockY`; it does not read `fx/fy` directly.
- Persisted pin positions are restored before the pin is applied.
- Unpinning clears both persistent pin and lock fields and reheats the loop.

Temporary focal locks and pinned-node repositioning also use `isLocked`. A future model must distinguish persistent pin intent from transient movement constraints rather than representing both as one `pinned` flag.

## Containers and graph contexts

`contextId` is useful identity, but it is not sufficient to reproduce current force isolation.

- Two nodes interact when both are uncontained or when they share at least one computed container key.
- They are separated when either has container membership and they share no container key.
- Membership comes from parent-container member sets and embedded-container membership/ancestry.
- Parent-container members skip ordinary world-centering force.
- Embedded members are pulled toward their container gravity center using that container's `linkForce` and a dead zone.
- Nodes are constrained back inside parent and embedded bounds after integration.
- Containers repel nodes and other containers, and container anchors can transfer motion to origin nodes.
- An origin owning an open lens and dragged lens descendants are temporarily excluded from ordinary movement.

Exact parity therefore requires an explicit container/constraint projection in addition to `GraphPhysicsInput.nodes[].contextId`.

## Freeze, interaction, and settling

- The freeze hotkey freezes only while held. `simulate()` returns zero, drawing continues, and existing velocity is retained for resume.
- Topology/settings refresh can temporarily freeze existing nodes and zero their velocity until settling or active interaction clears the freeze.
- Alt-drag maintains its own transient frozen-node set.
- Dragged nodes and dragged lens descendants use separate exclusion rules.
- Active dragging, panning, marquee selection, or a pressed node keeps the loop alive.
- Below the rest threshold, 24 consecutive frames are required before the loop stops.
- Near rest, the target frame interval changes from 16 ms to 50 ms.
- `reheatSimulation(amount)` currently uses the amount only to reject a non-positive request; positive magnitudes all just start the loop.

These are runtime-control states, not structural graph state and not ordinary kinematics coordinates.

## Extraction consequences

The host-neutral [GraphPhysicsSettings](GraphPhysicsSettings.md) model now addresses items 1 through 5 below. Constraint and container work remains:

1. Separate physics settings from render-only `textFadeThreshold`.
2. Carry damping and settling cadence explicitly instead of leaving hidden constants.
3. Resolve effective node radius before projection.
4. Represent force-based and direction-based LinkType policy as distinct modes.
5. Encode and test LinkType precedence and clamps.
6. Add a separate container/constraint projection before claiming live parity.
7. Model persistent pins separately from transient locks, drags, and freezes.
8. Keep simulation-control state outside structural `GraphStore` revisioning.

## Remaining manual characterization

Before live physics activation, verify representative graphs for nested lenses, overlapping parent containers, Alt-drag, pinned-node repositioning, direction cycles, mixed direction/force edges, and hotkey freeze/resume. These behaviors are too interaction-heavy to prove from source inspection alone.
