# LegacyGraphPhysicsSettingsAdapter

## Purpose

`LegacyGraphPhysicsSettingsAdapter` translates current engine and LinkType configuration shapes into host-neutral [GraphPhysicsSettings](GraphPhysicsSettings.md) input.

Current implementation: [`src/graph-application/LegacyGraphPhysicsSettingsAdapter.ts`](../../src/graph-application/LegacyGraphPhysicsSettingsAdapter.ts)

The adapter has no Obsidian or `GraphEngine` import and is not live-wired yet.

## Mapping rules

- Global repulsion, center, and rest thresholds pass to the pure normalizer.
- LinkType property identities are trimmed and lower-cased.
- Force-based definitions map distance and strength.
- Direction-based definitions map direction and X/Y spacing.
- Runtime-only overrides remain available even without an active definition.
- Blank LinkType identities are ignored.
- Active definition and runtime override remain separate sources so the normalizer preserves documented precedence.

The adapter does not normalize clamps or defaults itself; [GraphPhysicsSettings](GraphPhysicsSettings.md) remains the single policy owner.

## Connections

- Reads a narrow legacy-shaped data interface rather than engine objects.
- Produces input for `normalizeGraphPhysicsSettings()`.
- Encodes behavior recorded in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).
- Will later be composed by [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md).

## Next extraction

Add a legacy transient-constraint adapter for hotkey freeze, topology freeze, Alt-drag, active drag, direction targets, focal locks, and lens movement exclusions.
