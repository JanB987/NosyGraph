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
export type GraphBadgeSemantic = "link" | "parent" | "lens";
export type GraphBadgeIconKind = "force" | "direction" | "parent" | "lens";

/** One available LinkType expansion control for a runtime node instance. */
export interface GraphBadge {
  id: BadgeId;
  nodeId: NodeInstanceId;
  /** Canonical LinkType-definition identity used by commands and rendering. */
  linkTypeId: LinkTypeId;
  /** The pre-Iteration-4 property identity, retained for persisted-state lookup. */
  legacyLinkTypeId?: LinkTypeId;
  /** Canonical note path when this badge is backed by a LinkType note. */
  definitionReference?: string;
  contextId: GraphContextId;
  label: string;
  color: string;
  state: GraphBadgeState;
  semantic: GraphBadgeSemantic;
  iconKind?: GraphBadgeIconKind;
  hasRelationships: boolean;
  duplicateNodes: boolean;
  expansionId?: ExpansionId;
}
