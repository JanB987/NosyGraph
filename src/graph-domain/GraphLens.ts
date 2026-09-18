import type {
  GraphContextId,
  GraphDocumentId,
  LensId,
  NodeInstanceId
} from "./graph-identifiers";

export interface GraphRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GraphViewport {
  x: number;
  y: number;
  zoom: number;
}

/** A movable viewport into an embedded graph context. */
export interface GraphLens {
  id: LensId;
  sourceNodeId: NodeInstanceId;
  documentId: GraphDocumentId;
  contextId: GraphContextId;
  bounds: Readonly<GraphRectangle>;
  viewport: Readonly<GraphViewport>;
  locked: boolean;
  maximized: boolean;
}

