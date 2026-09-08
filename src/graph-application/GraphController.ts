import type { BadgeId, NodeInstanceId } from "../graph-domain/graph-identifiers";
import {
  createGraphBadgeRequest,
  type GraphBadgeAction,
  type GraphBadgeRequest
} from "./GraphBadgeRequest";
import type { GraphQueries } from "./GraphQueries";
import { GraphStore } from "./GraphStore";

/** A detached point used by pinning and drag commands. */
export interface GraphPoint {
  x: number;
  y: number;
}

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

/** Modifier state captured at the badge event boundary. */
export interface GraphBadgeModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface GraphBadgeInteractionCommand {
  type: "badge-interaction";
  badgeId: BadgeId;
  modifiers: GraphBadgeModifierState;
}

/**
 * Preserves the legacy modifier precedence:
 * Alt opens link input; Ctrl/Cmd without Shift expands a chain; all other
 * combinations toggle the badge, including Ctrl/Cmd+Shift.
 */
export function resolveGraphBadgeAction(
  modifiers: GraphBadgeModifierState
): GraphBadgeAction {
  if (modifiers.altKey) return "open-badge-input";
  if ((modifiers.ctrlKey || modifiers.metaKey) && !modifiers.shiftKey) {
    return "expand-badge-chain";
  }
  return "toggle-badge";
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

/**
 * Pin commands carry a stable node instance ID. The host adapter applies the
 * actual fixed-coordinate and persistence behavior.
 */
export type GraphPinCommand =
  | {
      type: "pin-node";
      nodeId: NodeInstanceId;
      position?: GraphPoint;
      persist?: boolean;
    }
  | {
      type: "unpin-node";
      nodeId: NodeInstanceId;
      persist?: boolean;
      restartSimulation?: boolean;
    };

export interface GraphPinCommandPort {
  executePin(command: GraphPinCommand): void | Promise<void>;
}

export interface GraphPinCommandResult {
  handled: boolean;
  nodeId: NodeInstanceId;
  reason?: "node-not-found" | "pin-port-unavailable";
}

/**
 * Dragging is deliberately a lifecycle rather than a single position write.
 * This preserves host behavior for grouped selection, pinned repositioning,
 * persistence on end, and cancellation.
 */
export type GraphDragCommand =
  | {
      type: "begin-drag";
      nodeId: NodeInstanceId;
      position?: GraphPoint;
    }
  | {
      type: "move-drag";
      nodeId: NodeInstanceId;
      position: GraphPoint;
    }
  | {
      type: "end-drag";
      nodeId: NodeInstanceId;
      position?: GraphPoint;
      persist?: boolean;
    }
  | {
      type: "cancel-drag";
      nodeId: NodeInstanceId;
    };

export interface GraphDragCommandPort {
  executeDrag(command: GraphDragCommand): void | Promise<void>;
}

export interface GraphDragCommandResult {
  handled: boolean;
  nodeId: NodeInstanceId;
  reason?: "node-not-found" | "invalid-position" | "drag-port-unavailable";
}

/** Root membership changes are resolved and persisted by the host adapter. */
export type GraphRootCommand =
  | { type: "set-roots"; nodeIds: readonly NodeInstanceId[] }
  | { type: "add-root"; nodeId: NodeInstanceId }
  | { type: "remove-root"; nodeId: NodeInstanceId };

export interface GraphRootCommandPort {
  executeRoot(command: GraphRootCommand): void | Promise<void>;
}

export interface GraphRootCommandResult {
  handled: boolean;
  reason?: "root-port-unavailable";
}

/**
 * Refreshes relationships after a host metadata or graph-structure change.
 * The scope lets one adapter route to outer, embedded, visible-edge, or all
 * legacy refresh operations without exposing those methods to the controller.
 */
export type GraphRelationshipRefreshScope =
  | "outer"
  | "embedded"
  | "visible"
  | "embedded-visible"
  | "all";

export interface GraphRelationshipRefreshCommand {
  type: "refresh-relationships";
  sourcePath: string;
  changedProperties?: readonly string[];
  scope?: GraphRelationshipRefreshScope;
}

export interface GraphRelationshipRefreshCommandPort {
  executeRelationshipRefresh(
    command: GraphRelationshipRefreshCommand
  ): void | Promise<void>;
}

export interface GraphRelationshipRefreshCommandResult {
  handled: boolean;
  sourcePath: string;
  reason?: "source-path-invalid" | "relationship-port-unavailable";
}

export interface GraphControllerOptions {
  queries?: GraphQueries;
  badgePort?: GraphBadgeCommandPort;
  pinPort?: GraphPinCommandPort;
  dragPort?: GraphDragCommandPort;
  rootPort?: GraphRootCommandPort;
  relationshipPort?: GraphRelationshipRefreshCommandPort;
}

/**
 * Application command boundary for graph behavior.
 *
 * Selection and normal badges are already connected to the live legacy path.
 * Pinning, dragging, roots, and relationship refresh use explicit host ports so
 * their legacy mutations can be replaced independently without changing the
 * renderer or command vocabulary.
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

  executeBadgeInteraction(
    command: GraphBadgeInteractionCommand
  ): Promise<GraphBadgeCommandResult> {
    return this.executeBadge({
      type: resolveGraphBadgeAction(command.modifiers),
      badgeId: command.badgeId
    });
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

  async executePin(command: GraphPinCommand): Promise<GraphPinCommandResult> {
    if (!this.hasNode(command.nodeId)) {
      return { handled: false, nodeId: command.nodeId, reason: "node-not-found" };
    }
    const port = this.options.pinPort;
    if (!port) {
      return { handled: false, nodeId: command.nodeId, reason: "pin-port-unavailable" };
    }
    await port.executePin(command);
    return { handled: true, nodeId: command.nodeId };
  }

  async executeDrag(command: GraphDragCommand): Promise<GraphDragCommandResult> {
    if (!this.hasNode(command.nodeId)) {
      return { handled: false, nodeId: command.nodeId, reason: "node-not-found" };
    }
    const position = command.type === "cancel-drag" ? undefined : command.position;
    if (!this.validPosition(position)) {
      return { handled: false, nodeId: command.nodeId, reason: "invalid-position" };
    }
    const port = this.options.dragPort;
    if (!port) {
      return { handled: false, nodeId: command.nodeId, reason: "drag-port-unavailable" };
    }
    await port.executeDrag(command);
    return { handled: true, nodeId: command.nodeId };
  }

  async executeRoot(command: GraphRootCommand): Promise<GraphRootCommandResult> {
    const port = this.options.rootPort;
    if (!port) {
      return { handled: false, reason: "root-port-unavailable" };
    }
    await port.executeRoot(command);
    return { handled: true };
  }

  async executeRelationshipRefresh(
    command: GraphRelationshipRefreshCommand
  ): Promise<GraphRelationshipRefreshCommandResult> {
    const sourcePath = String(command.sourcePath ?? "").trim();
    if (!sourcePath) {
      return {
        handled: false,
        sourcePath,
        reason: "source-path-invalid"
      };
    }
    const port = this.options.relationshipPort;
    if (!port) {
      return {
        handled: false,
        sourcePath,
        reason: "relationship-port-unavailable"
      };
    }
    await port.executeRelationshipRefresh({
      ...command,
      sourcePath,
      changedProperties: command.changedProperties
        ?.map((property) => String(property ?? "").trim())
        .filter(Boolean)
    });
    return { handled: true, sourcePath };
  }

  private hasNode(nodeId: NodeInstanceId): boolean {
    const queries = this.options.queries;
    return !queries || Boolean(queries.getNodeInstance(nodeId));
  }

  private validPosition(position: GraphPoint | undefined): boolean {
    return position === undefined
      || (Number.isFinite(position.x) && Number.isFinite(position.y));
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
