import type {
  EdgeId,
  GraphContextId,
  LinkTypeId,
  NodeInstanceId
} from "./graph-identifiers";

/** Explains how a visible edge entered the runtime graph. */
export type GraphEdgeOrigin = "discovered" | "overlay" | "visible" | "parent";

/** One visible relationship between two runtime node instances. */
export interface GraphEdge {
  id: EdgeId;
  fromNodeId: NodeInstanceId;
  toNodeId: NodeInstanceId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  origin: GraphEdgeOrigin;
}

