# GraphStore initializer

## Purpose

GraphStoreInitializer is the one-shot bootstrap boundary for store mode. It reads an initial GraphSnapshot from a host adapter, detaches the snapshot, validates it, and constructs GraphStore only when the complete consistency unit is valid.

The initializer accepts any GraphSnapshotSource. In production this source will be composed from graph-document configuration and Obsidian adapters. The current legacy adapter can provide the same shape for migration experiments without transferring ownership.

## Initialization sequence

1. Read the source snapshot once.
2. Deep-copy notes, properties, node coordinates, origins, ownership arrays, lens bounds, and viewports.
3. Reject blank or duplicate IDs in every collection.
4. Reject missing references between notes, nodes, edges, badges, expansions, and lenses.
5. Reject cyclic nested expansion ownership.
6. Construct GraphStore from the detached, validated snapshot.

The source remains host-owned. Later source changes do not mutate the initialized store, and the store never retains the source arrays.

## Validation failures

| Failure | Meaning |
|---|---|
| invalid-id | A collection entity has a blank identity. |
| duplicate-id | One collection contains the same identity more than once. |
| missing-reference | An edge, badge, node origin, expansion, or lens points to an absent entity. |
| expansion-cycle | Nested expansion ownership contains a cycle. |

Failures are returned before GraphStore construction as a structured invalid-snapshot result. There is no partial store and no best-effort removal of invalid entities.

## Stable identity rule

The initializer copies identities exactly as supplied by the adapter. It does not regenerate node-instance, badge, edge, expansion, lens, note, or graph-context IDs. This preserves persisted ownership and makes a later store-mode reopen comparable with the legacy snapshot.

## Current status

The initializer and validation function are implemented and tested. They are experimental because production still starts in legacy mode; GraphEngine remains the live semantic owner. Store mode may select this boundary only after renderer, physics, command, persistence, and manual parity gates pass.

## Connections

- Uses the host-neutral GraphSnapshot as input.
- Constructs [GraphStore](GraphStore.md).
- Can consume [LegacyGraphSnapshotAdapter](LegacyGraphSnapshotAdapter.md) during migration.
- Is part of [GraphStore Ownership Cutover](GraphStoreOwnershipCutover.md) Stage 3.
- Test coverage: [GraphStoreInitializer.test.ts](../../src/graph-application/GraphStoreInitializer.test.ts).
