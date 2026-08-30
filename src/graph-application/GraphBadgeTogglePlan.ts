import type { GraphBadgeState } from "../graph-domain/GraphBadge";
import type {
  BadgeId,
  ExpansionId,
  GraphContextId,
  LinkTypeId,
  NodeInstanceId,
  NoteId
} from "../graph-domain/graph-identifiers";
import type { GraphBadgeRequest } from "./GraphBadgeRequest";

export interface GraphBadgeToggleInput {
  request: GraphBadgeRequest;
  badgeState: GraphBadgeState;
  targetNoteIds: readonly NoteId[];
  parentExpansionId: ExpansionId | null;
}

export type GraphBadgeTogglePlan =
  | {
      kind: "expand";
      badgeId: BadgeId;
      expansionId: ExpansionId;
      sourceNodeId: NodeInstanceId;
      sourceNoteId: NoteId;
      linkTypeId: LinkTypeId;
      contextId: GraphContextId;
      targetNoteIds: readonly NoteId[];
      parentExpansionId: ExpansionId | null;
    }
  | {
      kind: "collapse";
      badgeId: BadgeId;
      expansionId: ExpansionId;
      sourceNodeId: NodeInstanceId;
      sourceNoteId: NoteId;
      linkTypeId: LinkTypeId;
      contextId: GraphContextId;
    }
  | {
      kind: "unsupported";
      badgeId: BadgeId;
      reason: "unsupported-action" | "unsupported-semantic";
    };

/**
 * Describes the next normal link-badge toggle without mutating graph state.
 * Parent and non-toggle behavior remain separate command paths.
 */
export function planGraphBadgeToggle(input: GraphBadgeToggleInput): GraphBadgeTogglePlan {
  const { request } = input;
  if (request.action !== "toggle-badge") {
    return { kind: "unsupported", badgeId: request.badgeId, reason: "unsupported-action" };
  }
  if (request.semantic !== "link") {
    return { kind: "unsupported", badgeId: request.badgeId, reason: "unsupported-semantic" };
  }
  if (input.badgeState === "expanded") {
    return {
      kind: "collapse",
      badgeId: request.badgeId,
      expansionId: request.badgeId,
      sourceNodeId: request.nodeId,
      sourceNoteId: request.noteId,
      linkTypeId: request.linkTypeId,
      contextId: request.contextId
    };
  }

  return {
    kind: "expand",
    badgeId: request.badgeId,
    expansionId: request.badgeId,
    sourceNodeId: request.nodeId,
    sourceNoteId: request.noteId,
    linkTypeId: request.linkTypeId,
    contextId: request.contextId,
    targetNoteIds: Array.from(new Set(input.targetNoteIds)),
    parentExpansionId: input.parentExpansionId
  };
}
