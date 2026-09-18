# GraphPhysicsShadowDiagnostics

## Purpose

`GraphPhysicsShadowDiagnostics` turns a [GraphPhysicsShadowInputService](GraphPhysicsShadowInputService.md) capture into a compact structural summary and compares two summaries field by field.

Current implementation: [`src/graph-application/GraphPhysicsShadowDiagnostics.ts`](../../src/graph-application/GraphPhysicsShadowDiagnostics.ts)

The summary retains counts and version numbers, not node IDs, positions, note metadata, or complete settings. It is therefore suitable for bounded debug observations while the full capture remains available for focused tests.

## Summary categories

- Structural and frame versions.
- Node, edge, and LinkType-policy counts.
- Persistent and transient constraint counts by kind.
- Parent and embedded container counts.
- Legacy-adapter and projection issue counts.

## Connections

- Summarizes the normalized output of [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md).
- Preserves issue categories established by [LegacyGraphPhysicsReadAdapter](LegacyGraphPhysicsReadAdapter.md).
- Does not compare positions or solver output; later frame parity belongs beside [GraphKinematicsFrame](GraphKinematicsFrame.md).
- Does not log. [GraphPhysicsShadowObserver](GraphPhysicsShadowObserver.md) forwards compact values to an injected sink.

## Next extraction

Expose the opt-in observer through an explicit `GraphEngine` method. Keep the animation loop and active solver unchanged.
