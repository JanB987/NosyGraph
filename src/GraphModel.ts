export interface GraphNode {
  id: string;
  path: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export class GraphModel {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();

  clear() {
    this.nodes.clear();
    this.edges.clear();
  }

  setNodes(nodes: GraphNode[]) {
    this.nodes.clear();
    for (const n of nodes) {
      this.nodes.set(n.path, n);
    }
  }

  setEdges(edges: GraphEdge[]) {
    this.edges.clear();
    for (const e of edges) {
      this.edges.set(e.id, e);
    }
  }

  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  getNode(path: string): GraphNode | undefined {
    return this.nodes.get(path);
  }

  getEdgesForNode(path: string): GraphEdge[] {
    const out: GraphEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.source === path || edge.target === path) {
        out.push(edge);
      }
    }
    return out;
  }

  updateNodeMetadata(path: string, metadata: Record<string, unknown>) {
    const node = this.nodes.get(path);
    if (!node) return;
    node.metadata = metadata;
  }

  removeNode(path: string) {
    this.nodes.delete(path);

    for (const [id, edge] of this.edges) {
      if (edge.source === path || edge.target === path) {
        this.edges.delete(id);
      }
    }
  }

  addNode(node: GraphNode) {
    this.nodes.set(node.path, node);
  }

  updateEdgesForNode(path: string, edges: GraphEdge[]) {
    for (const [id, edge] of this.edges) {
      if (edge.source === path || edge.target === path) {
        this.edges.delete(id);
      }
    }

    for (const edge of edges) {
      this.edges.set(edge.id, edge);
    }
  }
}
