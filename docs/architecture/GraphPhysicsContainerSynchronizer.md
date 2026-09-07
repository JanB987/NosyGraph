# GraphPhysicsContainerSynchronizer

## Purpose and status

'GraphPhysicsContainerSynchronizer' extracts the dynamic container-definition work that still lives inside 'GraphEngine':

- parent containers rebuild direct membership from exact expansion requests and parent relationships;
- parent bounds recalculate from current member positions and radii;
- embedded container viewport bounds recalculate from the origin radius while keeping their current center;
- stale and empty parent containers disappear;
- container ancestry is derived after all definitions are assembled.

Implementation: [GraphPhysicsContainerSynchronizer.ts](../../src/graph-domain/GraphPhysicsContainerSynchronizer.ts). Tests: [GraphPhysicsContainerSynchronizer.test.ts](../../src/graph-domain/GraphPhysicsContainerSynchronizer.test.ts).

A5 extracts synchronization and recalculation only. It does not mutate the live engine, publish render state, or replace [GraphPhysicsAnchoringState](GraphPhysicsAnchoringState.md). Runtime bounds, anchor direction, and origin history remain a separate evolving state owned by A4.

## Parent synchronization

The caller supplies stable parent request IDs and direct parent relationships. A request receives only relationships with the same container ID; this preserves the legacy rule that one expansion owns only its exact targets. Duplicate member relationships collapse in first-seen order. Relationships for unknown requests or missing nodes are reported and ignored.

For each nonempty request, bounds are calculated from member positions and projected radii:

    padding = max(6, baseNodeRadius * 0.45)
    left   = min(member.x - member.radius) - padding
    top    = min(member.y - member.radius) - padding
    right  = max(member.x + member.radius) + padding
    bottom = max(member.y + member.radius) + padding

Width and height are each increased to max(44, baseNodeRadius * 2.2) when necessary. This uses the legacy base radius for the viewport floor; it does not substitute an individual member radius.

An existing parent is recalculated even when its member list or source bounds changed. The synchronizer does not carry anchor history or perform post-integration origin attachment; those steps remain in [GraphContainerAnchoring](GraphContainerAnchoring.md). Empty requests and existing parents with no active request are removed.

## Embedded recalculation

Existing embedded containers remain present. Their viewport width and height become:

    max(max(44, baseNodeRadius * 2.2), originRadius * 2.8)

The current bounds center is preserved while the dimensions change. Missing origins use the base radius and are reported. Raw member IDs, gravity strength, and other detached container fields are preserved. Embedded raw node coordinates remain unconstrained, as described by [GraphContainerConfinement](GraphContainerConfinement.md).

## Ancestry and kinds

After parent and embedded records are assembled, each container's parentContainerIds is derived from containers whose membership includes its origin node. A requested parent replaces an existing embedded record with the same ID rather than producing duplicate IDs; the kind replacement is reported.

The result is fully detached. It reports created and recalculated parents, removed and empty parents, replaced kinds, ignored relationships, recalculated embedded records, and missing embedded origins. The caller can pass the result into the existing projector and then reconcile runtime anchoring state separately.

## Next integration step

The next increment should connect this boundary to a host-neutral read adapter and decide how its desired bounds interact with evolving runtime bounds during a live structural update. [GraphPhysicsRuntimeInputComposer](GraphPhysicsRuntimeInputComposer.md) currently accepts static container candidates and does not yet call this synchronizer. The staged engine therefore remains an explicit experiment and does not silently create new anchor seeds.
