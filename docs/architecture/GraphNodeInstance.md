# GraphNodeInstance

## Purpose

`GraphNodeInstance` is one runtime visualization of a [GraphNote](GraphNote.md). Multiple node instances may refer to the same note.

Current implementation: [`src/graph-domain/GraphNodeInstance.ts`](../../src/graph-domain/GraphNodeInstance.ts)

## Core data

```ts
interface GraphNodeInstance {
  id: NodeInstanceId;
  noteId: NoteId;
  contextId: GraphContextId;
  position: Point;
  velocity: Vector;
  radius: number;
  pinned: boolean;
  selected: boolean;
  origin: NodeOrigin;
}
```

`NodeOrigin` distinguishes roots, filters, [badge expansions](GraphExpansion.md), and embedded graph instances.

## Connections

- Stored in [GraphStore](GraphStore.md).
- Rendered by [GraphRenderer](GraphRenderer.md).
- Converted to a physics body for [PhysicsEngine](PhysicsEngine.md).
- May own [GraphBadge](GraphBadge.md) instances.

## Must not do

A node does not handle clicks, read notes, write YAML, create child nodes, or call physics. The renderer emits a node intent and [GraphController](GraphController.md) handles it.
