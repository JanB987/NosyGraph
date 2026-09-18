import type {
  EdgeId,
  GraphContextId,
  LinkTypeId,
  NodeInstanceId
} from "./graph-identifiers";

/** Stable identity shared by materialized and legacy-adapted badge expansion edges. */
export function createGraphBadgeExpansionEdgeId(
  fromNodeId: NodeInstanceId,
  toNodeId: NodeInstanceId,
  linkTypeId: LinkTypeId
): EdgeId {
  return `edge::${fromNodeId}::${toNodeId}::${linkTypeId}::${linkTypeId}`;
}

/** Explains how a visible edge entered the runtime graph. */
export type GraphEdgeOrigin =
  | "badge-expansion"
  | "discovered"
  | "overlay"
  | "visible"
  | "parent";

/** One visible relationship between two runtime node instances. */
export interface GraphEdge {
  id: EdgeId;
  fromNodeId: NodeInstanceId;
  toNodeId: NodeInstanceId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  origin: GraphEdgeOrigin;
}
