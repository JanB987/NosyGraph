# GraphSceneStore

## Purpose

GraphSceneStore is the detached owner for scene state shared by rendering, physics projection, and host persistence:

- GraphLens records describe embedded graph viewports.
- GraphGroup records describe grouping rules and styles.
- GraphContainer records describe parent or embedded spatial membership.

Each record has a stable identity. The store owns creation, update, and removal through GraphSceneCommand and returns copied snapshots.

## Command boundary

GraphSceneCommand has explicit create, update, and remove variants for lenses, groups, and containers. GraphController.executeScene delegates these commands to a GraphSceneCommandPort. The port keeps host persistence and DOM handles outside the state owner.

## Validation and ownership

The store rejects duplicate or missing IDs, malformed lens and group values, duplicate member IDs, missing container parents, self-references, and container cycles. Updates and removals are explicit; a missing target never creates an implicit record.

Snapshots and nested collections are copied on read and write. Revision increments only when a command changes scene state.

## Migration status

GraphSceneStore is implemented and tested as an experimental boundary. GraphView and GraphEngine remain the live owners of group registries, embedded lens maps, and parent container maps. Their adapters can adopt this command contract after scene parity and persistence evidence are complete.
