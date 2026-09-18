# GraphPhysicsShadowObserver

## Purpose

`GraphPhysicsShadowObserver` emits one compact physics observation when a caller explicitly supplies a shadow capture. It does not schedule captures, retain a baseline, log, or run physics.

Current implementation: [`src/graph-application/GraphPhysicsShadowObserver.ts`](../../src/graph-application/GraphPhysicsShadowObserver.ts)

## Flow

```text
GraphPhysicsShadowInputCapture
          + optional expected summary
                         |
                         v
GraphPhysicsShadowObserver
                         |
                         v
summary + optional field comparison -> injected observation sink
```

The caller owns the expected baseline. This prevents normal topology changes from being misreported automatically as parity failures.

## Connections

- Delegates summarization and comparison to [GraphPhysicsShadowDiagnostics](GraphPhysicsShadowDiagnostics.md).
- Accepts captures from [GraphPhysicsShadowInputService](GraphPhysicsShadowInputService.md).
- The injected sink decides whether to store, display, or log an observation.
- Has no dependency on [GraphPhysicsEngine](GraphPhysicsEngine.md) or [GraphPhysicsCoordinator](GraphPhysicsCoordinator.md).

## Production wiring

`GraphEngine.observeArchitecturePhysicsInput()` constructs the observer only when called and requires the caller to supply a sink. An optional expected summary enables field-level comparison. Nothing calls this method from the animation loop and there is no default console sink.

Frame-summary comparisons are now available through GraphPhysicsShadowSampleService and explicit GraphEngine diagnostic methods; they remain outside the animation loop.
