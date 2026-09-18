# LegacyGraphPhysicsConstraintAdapter

## Purpose

`LegacyGraphPhysicsConstraintAdapter` translates overloaded legacy lock, drag, direction, and freeze collections into explicit transient [GraphPhysicsConstraints](GraphPhysicsConstraints.md).

Current implementation: [`src/graph-application/LegacyGraphPhysicsConstraintAdapter.ts`](../../src/graph-application/LegacyGraphPhysicsConstraintAdapter.ts)

It uses a narrow read-state interface and has no `GraphEngine`, DOM, or Obsidian dependency. Production is not wired to it yet.

## Mapping

- Focal and pin-reposition locks become distinct `position-lock` reasons.
- Active pointer positions become `drag-target` constraints.
- solved directional positions become `direction-target` constraints.
- Topology, Alt-drag, lens-owner, and dragged-descendant sets become distinct `velocity-freeze` reasons.
- Hotkey state becomes the independent whole-simulation freeze flag.

Overlapping constraints are preserved rather than collapsed. Blank node IDs and non-finite target coordinates are excluded and counted for diagnostics.

## Connections

- Produces transient input for [GraphPhysicsConstraintProjector](GraphPhysicsConstraintProjector.md).
- Preserves the distinctions found in [Legacy Physics Characterization](LegacyPhysicsCharacterization.md).
- Complements [LegacyGraphPhysicsSettingsAdapter](LegacyGraphPhysicsSettingsAdapter.md).
- Will eventually receive a snapshot of current private engine flags from a thin production read source.

## Next extraction

Add a legacy container read adapter that replaces graph-path ancestry with stable container IDs and produces validated container candidates.
