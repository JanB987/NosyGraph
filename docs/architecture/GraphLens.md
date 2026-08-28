# GraphLens

## Purpose

`GraphLens` is a movable viewport into another graph context. It reuses normal graph rules rather than owning a second graph implementation.

## Core data

```ts
interface GraphLens {
  id: LensId;
  sourceNodeId: NodeInstanceId;
  documentId: GraphDocumentId;
  contextId: GraphContextId;
  bounds: Rectangle;
  viewport: Viewport;
  locked: boolean;
}
```

## Operations

```ts
openLens(command): Promise<GraphLens>;
closeLens(lensId): void;
moveLens(lensId, position): void;
resizeLens(lensId, bounds): void;
panLens(lensId, delta): void;
zoomLens(lensId, zoom, anchor): void;
resetLensViewport(lensId): void;
```

## Connections

- Created by [GraphController](GraphController.md).
- Stored in [GraphStore](GraphStore.md).
- Drawn and clipped by [GraphRenderer](GraphRenderer.md).
- Contains nodes selected by `contextId`, accessible through [GraphQueries](GraphQueries.md).
- Persisted in [GraphDocument](GraphDocument.md).

