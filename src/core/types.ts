// Shared graph and query types used across the application.

export interface GraphNode {
  id: string;
  path: string;
  relativePath: string;
  vaultId: string;
  name: string;
  metadata: Record<string, unknown>;
  color?: string;
  size?: number;
  icon?: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  pinned?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  color?: string;
  property?: string;
  linkTypeId?: string;
  renderStyle?: "line" | "folder";
  opacity?: number;
  lineThickness?: number;
  lineLengthMultiplier?: number;
  forceStrength?: number;
}

export interface ExpansionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface QueryContext {
  currentDepth: number;
  maxDepth: number;
}
