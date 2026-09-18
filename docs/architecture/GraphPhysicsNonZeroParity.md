# Non-zero-step parity

## A8 result

The first controlled non-zero-step parity fixture compares the staged replacement with the characterized legacy force loop from one identical starting state.

Starting state:

- Nodes A and B at (0, 0) and (140, 0).
- Radius 10 for both nodes.
- One force edge with preferred distance 100 and strength 0.01.
- Repulsion strength 4000, damping 0.85, no containers, pins, freezes, or center gravity.
- Structural revision 14, frame sequence 100.

The fixture checks both the first step and a three-step trace. The expected legacy values are recorded in [GraphPhysicsNonZeroParity.test.ts](../../src/graph-application/GraphPhysicsNonZeroParity.test.ts), including the two force contributions, damped velocity, and integrated position at every step.

## Tolerance

The fixture uses 1e-6 for both position and velocity distance. The trace comparator also reports maximum observed error so a future mismatch can distinguish accumulated drift from a first-step difference. General parity comparisons retain the looser 0.001 default until each fixture establishes a tighter bound.

The current fixture matches at one and three steps with maximum position and velocity error within 1e-6. No numerical difference was found to investigate for this force-only case.

## Limits

This is a synchronized detached characterization test, not a live-loop claim. The current [GraphPhysicsParityService](GraphPhysicsParityService.md) still exposes the safe zero-step live check because GraphEngine does not yet provide a hook that advances and captures legacy motion at controlled step boundaries. Containers, anchoring, direction targets, nested lenses, and interaction lifecycle remain outside this first parity fixture.
