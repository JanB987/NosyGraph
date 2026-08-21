// Incremental force-directed layout that preserves node positions across frames.

import type { GraphEdge, GraphNode } from "../core/types";

export class ForceLayout {
  private repulsionStrength = 5000;
  private readonly springStrength = 0.0055;
  private readonly springLength = 140;
  private centeringStrength = 0.0025;
  private readonly damping = 0.72;
  private readonly maxVelocity = 12;
  private suspendedNodeIds = new Set<string>();
  private viewportWidth = 800;
  private viewportHeight = 600;
  private velocitySnapThreshold = 0.12;
  private cachedFolderGroupNodeIdsByNodeId = new Map<string, Set<string>>();
  private cachedNodesRef?: GraphNode[];
  private cachedEdgesRef?: GraphEdge[];
  private cachedNodeById = new Map<string, GraphNode>();
  private cachedNodeByIdNodesRef?: GraphNode[];
  private static readonly EXACT_REPULSION_NODE_LIMIT = 450;
  private static readonly GRID_REPULSION_CELL_SIZE = 280;

  setSuspendedNodeIds(nodeIds: string[]): void {
    this.suspendedNodeIds = new Set(nodeIds);
  }

  setCenteringStrength(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    this.centeringStrength = this.clamp(value, 0, 0.05);
  }

  getCenteringStrength(): number {
    return this.centeringStrength;
  }

  setRepulsionStrength(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    this.repulsionStrength = this.clamp(value, 0, 50000);
  }

  getRepulsionStrength(): number {
    return this.repulsionStrength;
  }

  setVelocitySnapThreshold(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    this.velocitySnapThreshold = this.clamp(value, 0, 2);
  }

  getVelocitySnapThreshold(): number {
    return this.velocitySnapThreshold;
  }

  initialize(nodes: GraphNode[], width = 800, height = 600): void {
    const safeWidth = Math.max(width, 320);
    const safeHeight = Math.max(height, 240);
    this.viewportWidth = safeWidth;
    this.viewportHeight = safeHeight;

    nodes.forEach((node, index) => {
      if (Number.isFinite(node.x) && Number.isFinite(node.y) && (node.x !== 0 || node.y !== 0)) {
        node.vx ??= 0;
        node.vy ??= 0;
        node.pinned ??= false;
        return;
      }

      const seed = this.hash(node.id) + index * 101;
      node.x = 40 + (seed % Math.max(safeWidth - 80, 1));
      node.y = 40 + ((seed * 31) % Math.max(safeHeight - 80, 1));
      node.vx = 0;
      node.vy = 0;
      node.pinned ??= false;
    });
    this.cachedNodesRef = undefined;
    this.cachedEdgesRef = undefined;
    this.cachedFolderGroupNodeIdsByNodeId = new Map();
    this.cachedNodeByIdNodesRef = undefined;
    this.cachedNodeById = new Map();
  }

  step(nodes: GraphNode[], edges: GraphEdge[]): number {
    if (nodes.length === 0) {
      return 0;
    }

    const centerX = this.viewportWidth / 2;
    const centerY = this.viewportHeight / 2;
    const margin = 40;

    for (const node of nodes) {
      node.vx ??= 0;
      node.vy ??= 0;
    }

    const movableNodes = nodes.filter((node) => !node.pinned && !this.suspendedNodeIds.has(node.id));
    if (movableNodes.length === 0) {
      for (const node of nodes) {
        node.vx = 0;
        node.vy = 0;
      }
      return 0;
    }

    const folderGroupNodeIdsByNodeId = this.getFolderGroupNodeIdsByNodeId(nodes, edges);

    this.applyRepulsion(nodes, folderGroupNodeIdsByNodeId);

    const nodeById = this.getNodeById(nodes);
    for (const edge of edges) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) {
        continue;
      }
      if (this.suspendedNodeIds.has(source.id) || this.suspendedNodeIds.has(target.id)) {
        continue;
      }

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const lengthMultiplier = Number.isFinite(edge.lineLengthMultiplier) ? Math.max(0.2, edge.lineLengthMultiplier!) : 1;
      const forceMultiplier = Number.isFinite(edge.forceStrength) ? Math.max(0.1, edge.forceStrength!) : 1;
      const targetLength = this.springLength
        * lengthMultiplier
        * (edge.renderStyle === "folder" ? 0.72 : 1);
      const springStrength = this.springStrength
        * forceMultiplier
        * (edge.renderStyle === "folder" ? 1.8 : 1);
      const extension = distance - targetLength;
      const force = extension * springStrength;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      if (!source.pinned) {
        source.vx! += fx;
        source.vy! += fy;
      }
      if (!target.pinned) {
        target.vx! -= fx;
        target.vy! -= fy;
      }
    }

    let maxVelocityMagnitude = 0;
    for (const node of nodes) {
      if (node.pinned || this.suspendedNodeIds.has(node.id)) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      node.vx! += (centerX - node.x) * this.centeringStrength;
      node.vy! += (centerY - node.y) * this.centeringStrength;
      node.vx = this.clamp(node.vx! * this.damping, -this.maxVelocity, this.maxVelocity);
      node.vy = this.clamp(node.vy! * this.damping, -this.maxVelocity, this.maxVelocity);
      maxVelocityMagnitude = Math.max(maxVelocityMagnitude, Math.hypot(node.vx, node.vy));
      node.x += node.vx;
      node.y += node.vy;
      node.x = this.clamp(node.x, margin, Math.max(this.viewportWidth - margin, margin));
      node.y = this.clamp(node.y, margin, Math.max(this.viewportHeight - margin, margin));
    }

    if (maxVelocityMagnitude < this.velocitySnapThreshold) {
      for (const node of nodes) {
        node.vx = 0;
        node.vy = 0;
      }
      return 0;
    }

    return maxVelocityMagnitude;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private applyRepulsion(
    nodes: GraphNode[],
    folderGroupNodeIdsByNodeId: Map<string, Set<string>>,
  ): void {
    if (nodes.length <= ForceLayout.EXACT_REPULSION_NODE_LIMIT) {
      for (let index = 0; index < nodes.length; index++) {
        const nodeA = nodes[index];
        for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex++) {
          this.applyPairRepulsion(nodeA, nodes[otherIndex], folderGroupNodeIdsByNodeId);
        }
      }
      return;
    }

    const cellSize = ForceLayout.GRID_REPULSION_CELL_SIZE;
    const grid = new Map<string, GraphNode[]>();
    for (const node of nodes) {
      const cellX = Math.floor(node.x / cellSize);
      const cellY = Math.floor(node.y / cellSize);
      const key = `${cellX}:${cellY}`;
      const cell = grid.get(key);
      if (cell) {
        cell.push(node);
      } else {
        grid.set(key, [node]);
      }
    }

    for (const [key, cellNodes] of grid.entries()) {
      const [cellXText, cellYText] = key.split(":");
      const cellX = Number(cellXText);
      const cellY = Number(cellYText);
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const neighborKey = `${cellX + offsetX}:${cellY + offsetY}`;
          const neighborNodes = grid.get(neighborKey);
          if (!neighborNodes) {
            continue;
          }
          for (const nodeA of cellNodes) {
            for (const nodeB of neighborNodes) {
              if (nodeA.id >= nodeB.id) {
                continue;
              }
              this.applyPairRepulsion(nodeA, nodeB, folderGroupNodeIdsByNodeId);
            }
          }
        }
      }
    }
  }

  private applyPairRepulsion(
    nodeA: GraphNode,
    nodeB: GraphNode,
    folderGroupNodeIdsByNodeId: Map<string, Set<string>>,
  ): void {
    if (this.suspendedNodeIds.has(nodeA.id) || this.suspendedNodeIds.has(nodeB.id)) {
      return;
    }
    if (this.shouldSuppressRepulsion(folderGroupNodeIdsByNodeId, nodeA.id, nodeB.id)) {
      return;
    }
    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const distanceSquared = Math.max(dx * dx + dy * dy, 1);
    const distance = Math.sqrt(distanceSquared);
    const force = this.repulsionStrength / distanceSquared;
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;

    if (!nodeA.pinned) {
      nodeA.vx! -= fx;
      nodeA.vy! -= fy;
    }
    if (!nodeB.pinned) {
      nodeB.vx! += fx;
      nodeB.vy! += fy;
    }
  }

  private getNodeById(nodes: GraphNode[]): Map<string, GraphNode> {
    if (this.cachedNodeByIdNodesRef === nodes) {
      return this.cachedNodeById;
    }

    this.cachedNodeByIdNodesRef = nodes;
    this.cachedNodeById = new Map(nodes.map((node) => [node.id, node] as const));
    return this.cachedNodeById;
  }

  private hash(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  private buildFolderGroupNodeIdsByNodeId(
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): Map<string, Set<string>> {
    const folderEdges = edges.filter((edge) => edge.renderStyle === "folder");
    if (folderEdges.length === 0) {
      return new Map();
    }

    const adjacency = new Map<string, Set<string>>();
    for (const node of nodes) {
      adjacency.set(node.id, new Set());
    }

    for (const edge of folderEdges) {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    }

    const visited = new Set<string>();
    const groupsByNodeId = new Map<string, Set<string>>();
    for (const node of nodes) {
      if (visited.has(node.id)) {
        continue;
      }
      const stack = [node.id];
      const groupNodeIds = new Set<string>();
      while (stack.length > 0) {
        const currentNodeId = stack.pop();
        if (!currentNodeId || visited.has(currentNodeId)) {
          continue;
        }
        visited.add(currentNodeId);
        groupNodeIds.add(currentNodeId);
        for (const relatedNodeId of adjacency.get(currentNodeId) ?? []) {
          if (!visited.has(relatedNodeId)) {
            stack.push(relatedNodeId);
          }
        }
      }

      if (groupNodeIds.size < 2) {
        continue;
      }
      for (const groupNodeId of groupNodeIds) {
        groupsByNodeId.set(groupNodeId, groupNodeIds);
      }
    }

    return groupsByNodeId;
  }

  private getFolderGroupNodeIdsByNodeId(
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): Map<string, Set<string>> {
    if (this.cachedNodesRef === nodes && this.cachedEdgesRef === edges) {
      return this.cachedFolderGroupNodeIdsByNodeId;
    }

    this.cachedNodesRef = nodes;
    this.cachedEdgesRef = edges;
    this.cachedFolderGroupNodeIdsByNodeId = this.buildFolderGroupNodeIdsByNodeId(nodes, edges);
    return this.cachedFolderGroupNodeIdsByNodeId;
  }

  private shouldSuppressRepulsion(
    folderGroupNodeIdsByNodeId: Map<string, Set<string>>,
    nodeAId: string,
    nodeBId: string,
  ): boolean {
    const groupNodeIds = folderGroupNodeIdsByNodeId.get(nodeAId);
    return Boolean(groupNodeIds?.has(nodeBId));
  }
}
