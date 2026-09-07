# GraphContainerConfinement

## Purpose

`GraphContainerConfinement` applies parent-container bounds to a detached motion frame without mutating the source frame.

Current implementation: [`src/graph-domain/GraphContainerConfinement.ts`](../../src/graph-domain/GraphContainerConfinement.ts)

## Parent clamp

For each parent membership, in projected container order:

```text
min X = left + node radius + 10
max X = right - node radius - 10
min Y = top + node radius + 18
max Y = bottom - node radius - 10
```

A corrected axis has its velocity zeroed; the untouched axis retains velocity. Overlapping parent containers apply sequentially, matching the current map iteration behavior.

## Embedded behavior

Embedded container bounds deliberately do not clamp raw node coordinates. The live plugin fits that raw layout into the visible lens during rendering; clamping it to the viewport would collapse the embedded graph. The diagnostic count makes this no-op visible rather than accidental.

## Connections

- Consumes unsequenced output from [GraphMotionIntegrator](GraphMotionIntegrator.md).
- Uses resolved radii from [GraphPhysicsInput](GraphPhysicsInput.md).
- Uses parent membership and bounds from [GraphPhysicsContainers](GraphPhysicsContainers.md).
- Produces a detached [GraphKinematicsFrame](GraphKinematicsFrame.md) input.

## Next extraction

[StagedGraphPhysicsEngine](StagedGraphPhysicsEngine.md) composes force accumulation, integration, and confinement. [GraphContainerAnchoring](GraphContainerAnchoring.md) now separately extracts anchoring/member translation. The next increment composes anchoring followed by confinement again with updated bounds.
