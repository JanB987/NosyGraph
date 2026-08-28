import type { NodeInstanceId } from "../graph-domain/graph-identifiers";

/**
 * Incremental owner of mutable graph runtime state.
 *
 * Selection is the first migrated state category. Nodes, edges, expansions,
 * and lenses will move here in later behavior-preserving increments.
 */
export class GraphStore {
  private readonly selectedNodeIds = new Set<NodeInstanceId>();

  getSelectedNodeIds(): readonly NodeInstanceId[] {
    return Array.from(this.selectedNodeIds);
  }

  getSelectedNodeCount(): number {
    return this.selectedNodeIds.size;
  }

  isNodeSelected(nodeId: NodeInstanceId): boolean {
    return this.selectedNodeIds.has(nodeId);
  }

  selectOnly(nodeId: NodeInstanceId): boolean {
    const normalized = this.normalizeNodeId(nodeId);
    if (!normalized) return this.clearSelection();
    if (this.selectedNodeIds.size === 1 && this.selectedNodeIds.has(normalized)) return false;
    this.selectedNodeIds.clear();
    this.selectedNodeIds.add(normalized);
    return true;
  }

  toggleSelection(nodeId: NodeInstanceId): boolean {
    const normalized = this.normalizeNodeId(nodeId);
    if (!normalized) return false;
    if (this.selectedNodeIds.has(normalized)) {
      this.selectedNodeIds.delete(normalized);
    } else {
      this.selectedNodeIds.add(normalized);
    }
    return true;
  }

  replaceSelection(nodeIds: Iterable<NodeInstanceId>): boolean {
    const next = new Set<NodeInstanceId>();
    for (const nodeId of nodeIds) {
      const normalized = this.normalizeNodeId(nodeId);
      if (normalized) next.add(normalized);
    }
    if (this.selectionEquals(next)) return false;
    this.selectedNodeIds.clear();
    for (const nodeId of next) this.selectedNodeIds.add(nodeId);
    return true;
  }

  clearSelection(): boolean {
    if (this.selectedNodeIds.size === 0) return false;
    this.selectedNodeIds.clear();
    return true;
  }

  private selectionEquals(other: ReadonlySet<NodeInstanceId>): boolean {
    if (other.size !== this.selectedNodeIds.size) return false;
    for (const nodeId of other) {
      if (!this.selectedNodeIds.has(nodeId)) return false;
    }
    return true;
  }

  private normalizeNodeId(nodeId: NodeInstanceId): NodeInstanceId {
    return String(nodeId ?? "").trim();
  }
}

