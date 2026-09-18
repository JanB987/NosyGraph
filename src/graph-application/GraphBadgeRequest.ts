import type { GraphBadge, GraphBadgeSemantic } from "../graph-domain/GraphBadge";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type {
  BadgeId,
  GraphContextId,
  LinkTypeId,
  NodeInstanceId,
  NoteId
} from "../graph-domain/graph-identifiers";

export type GraphBadgeAction =
  | "toggle-badge"
  | "open-badge-input"
  | "expand-badge-chain";

/** Serializable input for badge behavior after read-model resolution. */
export interface GraphBadgeRequest {
  action: GraphBadgeAction;
  badgeId: BadgeId;
  nodeId: NodeInstanceId;
  noteId: NoteId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
  semantic: GraphBadgeSemantic;
}

export function createGraphBadgeRequest(
  action: GraphBadgeAction,
  badge: GraphBadge,
  node: GraphNodeInstance
): GraphBadgeRequest | undefined {
  if (node.id !== badge.nodeId) return undefined;
  return {
    action,
    badgeId: badge.id,
    nodeId: node.id,
    noteId: node.noteId,
    linkTypeId: badge.linkTypeId,
    contextId: badge.contextId,
    semantic: badge.semantic
  };
}
