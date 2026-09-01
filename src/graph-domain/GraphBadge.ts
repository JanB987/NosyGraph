import type {
  BadgeId,
  ExpansionId,
  GraphContextId,
  LinkTypeId,
  NodeInstanceId
} from "./graph-identifiers";

export function createGraphBadgeId(
  nodeId: NodeInstanceId,
  linkTypeId: LinkTypeId
): BadgeId {
  return `${nodeId}::${linkTypeId}`;
}

export type GraphBadgeState = "collapsed" | "expanded";
export type GraphBadgeSemantic = "link" | "parent";

/** One available LinkType expansion control for a runtime node instance. */
export interface GraphBadge {
  id: BadgeId;
  nodeId: NodeInstanceId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  label: string;
  color: string;
  state: GraphBadgeState;
  semantic: GraphBadgeSemantic;
  hasRelationships: boolean;
  duplicateNodes: boolean;
  expansionId?: ExpansionId;
}
