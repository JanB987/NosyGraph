# EmbeddedGraphPersistencePolicy

## Purpose

`shouldPersistEmbeddedGraphRuntime` defines when runtime nodes and badge states created inside a graph lens may be written to the embedded graph note.

## Rules

- A formal persistent graph note may always receive its embedded runtime state.
- A note with an existing readable `o3graph` block may continue receiving its state.
- A graph-capable note used as a lens inside a persistent parent graph may initialize its own `o3graph` block when the lens is first changed.
- A lens opened from an ephemeral parent remains ephemeral when its note has no existing state block.

The embedded note remains the owner of its nodes, positions, pins, and badge statuses. The parent graph stores only the embedded instance and lens state.

Current implementation: `src/graph-application/EmbeddedGraphPersistencePolicy.ts`, used by `GraphView.persistEmbeddedGraphRuntime`.
