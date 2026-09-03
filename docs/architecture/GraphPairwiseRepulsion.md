# GraphPairwiseRepulsion

## Purpose

`calculateGraphPairwiseRepulsion()` is the first pure mathematical extraction from the characterized legacy force loop.

Current implementation: [`src/graph-domain/GraphPairwiseRepulsion.ts`](../../src/graph-domain/GraphPairwiseRepulsion.ts)

## Legacy-compatible calculation

```text
center distance   = hypot(second - first), falling back to 1
boundary distance = max(1, center distance - first radius - second radius)
magnitude         = clamp(repulsion strength / boundary distance, 0, 8)
```

The returned velocity deltas are equal and opposite. The function mutates neither body.

Two less-obvious legacy behaviors are intentional:

- Mass is absent because the current solver initializes it but does not read it.
- Identical centers produce maximum magnitude but a zero direction vector, so neither body moves from this force alone.

## Connections

- Consumes already-resolved node radius from [GraphPhysicsInput](GraphPhysicsInput.md).
- Will be called only after container membership and transient constraints decide whether each body may receive force.
- Implements the node-node repulsion section recorded in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).
- Will become one component of a parity-capable [GraphPhysicsEngine](GraphPhysicsEngine.md).

## Next extraction

[GraphLinkSpring](GraphLinkSpring.md) now supplies the pure boundary-based spring. The next extraction composes both calculations in a stateless force accumulator.
