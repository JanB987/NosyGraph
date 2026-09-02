import type { EdgeId } from "../graph-domain/graph-identifiers";
import type { GraphPhysicsInput } from "../graph-domain/GraphPhysicsInput";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";

export interface GraphPhysicsInputProjectionResult {
  input: GraphPhysicsInput;
  diagnostics: {
    ignoredEdgeIds: readonly EdgeId[];
  };
}

/** Removes note, badge, ownership, lens, and rendering data from physics input. */
export class GraphPhysicsInputProjector {
  project(
    snapshot: GraphSnapshot,
    structuralRevision: number,
    frameSequence: number
  ): GraphPhysicsInputProjectionResult {
    const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
    const ignoredEdgeIds: EdgeId[] = [];

    const nodes = snapshot.nodes.map((node) => ({
      id: node.id,
      contextId: node.contextId,
      position: { ...node.position },
      velocity: { ...node.velocity },
      radius: node.radius,
      pinned: node.pinned
    }));

    const edges = snapshot.edges.flatMap((edge) => {
      if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
        ignoredEdgeIds.push(edge.id);
        return [];
      }
      return [{
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        linkTypeId: edge.linkTypeId,
        contextId: edge.contextId
      }];
    });

    return {
      input: {
        structuralRevision,
        frameSequence,
        nodes,
        edges
      },
      diagnostics: { ignoredEdgeIds }
    };
  }
}
