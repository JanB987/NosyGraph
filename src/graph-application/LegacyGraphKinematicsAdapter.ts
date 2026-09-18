import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import type { GraphPoint, GraphVector } from "../graph-domain/GraphNodeInstance";

export interface LegacyGraphKinematicsNodeRead {
  nodeId: string;
  position: Readonly<GraphPoint>;
  velocity: Readonly<GraphVector>;
}

export interface LegacyGraphKinematicsReadState {
  sequence: number;
  structuralRevision: number;
  nodes: readonly LegacyGraphKinematicsNodeRead[];
}

export interface LegacyGraphKinematicsReadResult {
  frame: GraphKinematicsFrame;
  diagnostics: {
    ignoredBlankNodeCount: number;
    duplicateNodeIds: readonly NodeInstanceId[];
  };
}

/** Copies legacy node motion into one deterministic host-neutral frame. */
export class LegacyGraphKinematicsAdapter {
  constructor(private readonly source: LegacyGraphKinematicsReadState) {}

  getFrame(): LegacyGraphKinematicsReadResult {
    const positions = new Map<NodeInstanceId, GraphPoint>();
    const velocities = new Map<NodeInstanceId, GraphVector>();
    const duplicateNodeIds: NodeInstanceId[] = [];
    let ignoredBlankNodeCount = 0;

    for (const node of this.source.nodes) {
      const nodeId = String(node.nodeId ?? "").trim();
      if (!nodeId) {
        ignoredBlankNodeCount += 1;
        continue;
      }
      if (positions.has(nodeId)) {
        duplicateNodeIds.push(nodeId);
        continue;
      }
      positions.set(nodeId, { ...node.position });
      velocities.set(nodeId, { ...node.velocity });
    }

    return {
      frame: {
        sequence: this.source.sequence,
        structuralRevision: this.source.structuralRevision,
        positions,
        velocities
      },
      diagnostics: { ignoredBlankNodeCount, duplicateNodeIds }
    };
  }
}
