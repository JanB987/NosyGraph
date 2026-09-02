# GraphPhysicsSettings

## Purpose

`GraphPhysicsSettings` is the complete host-neutral configuration consumed by the future [PhysicsEngine](PhysicsEngine.md). Pure functions normalize global values and resolve force-based or direction-based policy for each LinkType.

Current implementation: [`src/graph-domain/GraphPhysicsSettings.ts`](../../src/graph-domain/GraphPhysicsSettings.ts)

The types and functions are dormant. They do not yet read `O3LinkType`, graph-note settings, or change the live simulation.

## Global settings

```ts
interface GraphPhysicsSettings {
  repulsionStrength: number;
  centerStrength: number;
  damping: number;
  nearRestVelocityThreshold: number;
  restVelocityThreshold: number;
  settleFrameCount: number;
  activeFrameIntervalMs: number;
  nearSettleFrameIntervalMs: number;
  defaultLinkPolicy: GraphForceLinkPolicy;
  linkPolicies: ReadonlyMap<LinkTypeId, GraphLinkPhysicsPolicy>;
}
```

Hard-coded legacy values such as damping and frame cadence are explicit in the output. This makes them testable without pretending that they are currently user-configurable.

`nodeRadius` and `nodeConnectionSizeMultiplier` are absent because [GraphPhysicsInputProjector](GraphPhysicsInputProjector.md) receives an already-resolved effective radius for every node. `textFadeThreshold` is absent because it belongs to rendering.

## LinkType policies

```ts
type GraphLinkPhysicsPolicy =
  | {
      mode: "force";
      preferredDistance: number;
      strength: number;
    }
  | {
      mode: "direction";
      direction: "right" | "left" | "up" | "down";
      xSpacing: number;
      ySpacing: number;
    };
```

Separate variants prevent direction placement from being mistaken for another spring setting.

## Pure functions

```ts
normalizeGraphPhysicsSettings(input?): GraphPhysicsSettings;

resolveGraphLinkPhysicsPolicy(
  sources,
  defaultPolicy?
): GraphLinkPhysicsPolicy;
```

The resolver preserves current precedence:

1. Active LinkType definition.
2. Runtime/persisted override.
3. Default force policy.

Force distance is clamped to `20..800` and strength to `0.001..0.3`. Direction values other than left, up, or down become right. Direction spacing is absolute, at least one, and zero becomes `120`.

## Compatibility details

- Defaults are captured from [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).
- Finite negative repulsion and center values remain accepted because the current settings setter accepts them.
- Rest thresholds are non-negative, and near-rest is never lower than rest.
- The input LinkType map is copied into a resolved output map.
- Invalid numeric values fall through to the next precedence layer or default.

## Connections

- Configures [PhysicsEngine](PhysicsEngine.md).
- Selects policy for edges in [GraphPhysicsInput](GraphPhysicsInput.md) by `linkTypeId`.
- Will receive host values through an Obsidian/legacy adapter rather than importing `O3LinkType` here.
- Keeps simulation configuration outside [GraphStore](GraphStore.md) semantic collections and frame sequencing.

## Next extraction

Represent persistent pin intent separately from transient locks, dragging, topology freezes, and whole-simulation freeze state.
