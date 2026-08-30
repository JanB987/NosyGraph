import type { BadgeId } from "../graph-domain/graph-identifiers";
import type { GraphBadgeRequest } from "./GraphBadgeRequest";
import {
  planGraphBadgeToggle,
  type GraphBadgeTogglePlan
} from "./GraphBadgeTogglePlan";
import type { GraphQueries } from "./GraphQueries";
import type { GraphRelationshipTargetReader } from "./GraphRelationshipTargetReader";

export interface GraphBadgeToggleUnavailable {
  kind: "unavailable";
  badgeId: BadgeId;
  reason: "badge-not-found" | "node-not-found" | "request-outdated";
}

export type GraphBadgeToggleServiceResult =
  | GraphBadgeTogglePlan
  | GraphBadgeToggleUnavailable;

/** Coordinates live graph reads and relationship reads for toggle planning. */
export class GraphBadgeToggleService {
  constructor(
    private readonly queries: GraphQueries,
    private readonly targetReader: GraphRelationshipTargetReader
  ) {}

  async plan(request: GraphBadgeRequest): Promise<GraphBadgeToggleServiceResult> {
    const badge = this.queries.getBadge(request.badgeId);
    if (!badge) {
      return { kind: "unavailable", badgeId: request.badgeId, reason: "badge-not-found" };
    }
    const node = this.queries.getNodeInstance(request.nodeId);
    if (!node) {
      return { kind: "unavailable", badgeId: request.badgeId, reason: "node-not-found" };
    }
    if (
      badge.nodeId !== request.nodeId
      || badge.linkTypeId !== request.linkTypeId
      || badge.contextId !== request.contextId
      || badge.semantic !== request.semantic
      || node.noteId !== request.noteId
      || node.contextId !== request.contextId
    ) {
      return { kind: "unavailable", badgeId: request.badgeId, reason: "request-outdated" };
    }

    if (request.action !== "toggle-badge" || request.semantic !== "link") {
      return planGraphBadgeToggle({
        request,
        badgeState: badge.state,
        targetNoteIds: [],
        parentExpansionId: null
      });
    }

    const parentExpansionId = node.origin.kind === "badge-expansion"
      ? node.origin.expansionId
      : null;
    const targets = badge.state === "collapsed"
      ? await this.targetReader.readTargets({
          sourceNoteId: request.noteId,
          linkTypeId: request.linkTypeId
        })
      : [];

    return planGraphBadgeToggle({
      request,
      badgeState: badge.state,
      targetNoteIds: targets.map((target) => target.noteId),
      parentExpansionId
    });
  }
}
