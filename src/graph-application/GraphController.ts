import type { BadgeId, NodeInstanceId } from "../graph-domain/graph-identifiers";
import {
  createGraphBadgeRequest,
  type GraphBadgeAction,
  type GraphBadgeRequest
} from "./GraphBadgeRequest";
import type { GraphQueries } from "./GraphQueries";
import { GraphStore } from "./GraphStore";

export type GraphSelectionCommand =
  | { type: "select-only"; nodeId: NodeInstanceId }
  | { type: "toggle-selection"; nodeId: NodeInstanceId }
  | { type: "replace-selection"; nodeIds: readonly NodeInstanceId[] }
  | { type: "select-all"; nodeIds: readonly NodeInstanceId[] }
  | { type: "clear-selection" };

/** Result returned to a view or renderer after a selection command. */
export interface GraphSelectionResult {
  changed: boolean;
  selectedNodeIds: readonly NodeInstanceId[];
  selectedNodeCount: number;
}

export interface GraphBadgeCommand {
  type: GraphBadgeAction;
  badgeId: BadgeId;
}

/** Temporary output boundary implemented by the active legacy engine. */
export interface GraphBadgeCommandPort {
  executeBadge(request: GraphBadgeRequest): void | Promise<void>;
}

export interface GraphBadgeCommandResult {
  handled: boolean;
  badgeId: BadgeId;
  reason?: "badge-not-found" | "node-not-found" | "badge-port-unavailable";
}

export interface GraphControllerOptions {
  queries?: GraphQueries;
  badgePort?: GraphBadgeCommandPort;
}

/**
 * Application command boundary for graph behavior.
 *
 * Selection is the first command family. Root, expansion, relationship, and
 * lens commands will be introduced in later behavior-preserving increments.
 */
export class GraphController {
  constructor(
    private readonly store: GraphStore,
    private readonly options: GraphControllerOptions = {}
  ) {}

  executeSelection(command: GraphSelectionCommand): GraphSelectionResult {
    let changed: boolean;

    switch (command.type) {
      case "select-only":
        changed = this.store.selectOnly(command.nodeId);
        break;
      case "toggle-selection":
        changed = this.store.toggleSelection(command.nodeId);
        break;
      case "replace-selection":
      case "select-all":
        changed = this.store.replaceSelection(command.nodeIds);
        break;
      case "clear-selection":
        changed = this.store.clearSelection();
        break;
    }

    return this.selectionResult(changed);
  }

  selectOnly(nodeId: NodeInstanceId): GraphSelectionResult {
    return this.executeSelection({ type: "select-only", nodeId });
  }

  toggleSelection(nodeId: NodeInstanceId): GraphSelectionResult {
    return this.executeSelection({ type: "toggle-selection", nodeId });
  }

  replaceSelection(nodeIds: readonly NodeInstanceId[]): GraphSelectionResult {
    return this.executeSelection({ type: "replace-selection", nodeIds });
  }

  selectAll(nodeIds: readonly NodeInstanceId[]): GraphSelectionResult {
    return this.executeSelection({ type: "select-all", nodeIds });
  }

  clearSelection(): GraphSelectionResult {
    return this.executeSelection({ type: "clear-selection" });
  }

  async executeBadge(command: GraphBadgeCommand): Promise<GraphBadgeCommandResult> {
    const badge = this.options.queries?.getBadge(command.badgeId);
    if (!badge) {
      return { handled: false, badgeId: command.badgeId, reason: "badge-not-found" };
    }
    const node = this.options.queries?.getNodeInstance(badge.nodeId);
    if (!node) {
      return { handled: false, badgeId: command.badgeId, reason: "node-not-found" };
    }
    const port = this.options.badgePort;
    if (!port) {
      return { handled: false, badgeId: command.badgeId, reason: "badge-port-unavailable" };
    }

    const request = createGraphBadgeRequest(command.type, badge, node);
    if (!request) {
      return { handled: false, badgeId: command.badgeId, reason: "node-not-found" };
    }
    await port.executeBadge(request);

    return { handled: true, badgeId: badge.id };
  }

  private selectionResult(changed: boolean): GraphSelectionResult {
    const selectedNodeIds = this.store.getSelectedNodeIds();
    return {
      changed,
      selectedNodeIds,
      selectedNodeCount: selectedNodeIds.length
    };
  }
}
