# GraphLinkSpring

## Purpose

`calculateGraphLinkSpring()` is the pure boundary-based spring calculation extracted from the characterized legacy force loop.

Current implementation: [`src/graph-domain/GraphLinkSpring.ts`](../../src/graph-domain/GraphLinkSpring.ts)

## Legacy-compatible calculation

```text
boundary gap = max(0, center distance - first radius - second radius)
displacement = boundary gap - preferred distance
force        = clamp(strength * displacement, -5, 5)
```

Positive force pulls the endpoints together; negative force pushes them apart. Returned velocity deltas are equal and opposite.

For centers closer than `0.001`, the calculation uses the legacy stable FNV-1a angle derived from `first.id::second.id`. This avoids an undefined direction while remaining deterministic.

## Connections

- Consumes normalized force policies from [GraphPhysicsSettings](GraphPhysicsSettings.md).
- Consumes resolved radii and identity from [GraphPhysicsInput](GraphPhysicsInput.md).
- Overlay, direction, missing-endpoint, and separated-container decisions remain orchestration concerns outside this function.
- Complements [GraphPairwiseRepulsion](GraphPairwiseRepulsion.md).
- Implements the spring section recorded in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).

## Next extraction

Compose pairwise repulsion and link springs in a stateless force accumulator with explicit eligibility callbacks.
