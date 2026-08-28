import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
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

/**
 * Application command boundary for graph behavior.
 *
 * Selection is the first command family. Root, expansion, relationship, and
 * lens commands will be introduced in later behavior-preserving increments.
 */
export class GraphController {
  constructor(private readonly store: GraphStore) {}

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

  private selectionResult(changed: boolean): GraphSelectionResult {
    const selectedNodeIds = this.store.getSelectedNodeIds();
    return {
      changed,
      selectedNodeIds,
      selectedNodeCount: selectedNodeIds.length
    };
  }
}

