import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import {
  copyGraphSnapshot,
  type GraphSnapshot
} from "../graph-domain/GraphSnapshot";

export interface GraphKinematicsCompositionDiagnostics {
  updatedNodeIds: readonly NodeInstanceId[];
  positionFallbackNodeIds: readonly NodeInstanceId[];
  velocityFallbackNodeIds: readonly NodeInstanceId[];
  ignoredFrameNodeIds: readonly NodeInstanceId[];
}

export type GraphKinematicsCompositionResult =
  | {
      applied: true;
      frameSequence: number;
      snapshot: GraphSnapshot;
      diagnostics: GraphKinematicsCompositionDiagnostics;
    }
  | {
      applied: false;
      reason: "structural-revision-mismatch";
      snapshotStructuralRevision: number;
      frameStructuralRevision: number;
      frameSequence: number;
      snapshot: GraphSnapshot;
    };

/** Overlays a compatible motion frame onto a detached semantic snapshot. */
export class GraphSnapshotKinematicsComposer {
  compose(
    snapshot: GraphSnapshot,
    snapshotStructuralRevision: number,
    frame: GraphKinematicsFrame
  ): GraphKinematicsCompositionResult {
    const detachedSnapshot = copyGraphSnapshot(snapshot);
    if (frame.structuralRevision !== snapshotStructuralRevision) {
      return {
        applied: false,
        reason: "structural-revision-mismatch",
        snapshotStructuralRevision,
        frameStructuralRevision: frame.structuralRevision,
        frameSequence: frame.sequence,
        snapshot: detachedSnapshot
      };
    }

    const snapshotNodeIds = new Set(detachedSnapshot.nodes.map((node) => node.id));
    const updatedNodeIds: NodeInstanceId[] = [];
    const positionFallbackNodeIds: NodeInstanceId[] = [];
    const velocityFallbackNodeIds: NodeInstanceId[] = [];
    const ignoredFrameNodeIds = new Set<NodeInstanceId>();

    for (const nodeId of frame.positions.keys()) {
      if (!snapshotNodeIds.has(nodeId)) ignoredFrameNodeIds.add(nodeId);
    }
    for (const nodeId of frame.velocities.keys()) {
      if (!snapshotNodeIds.has(nodeId)) ignoredFrameNodeIds.add(nodeId);
    }

    const nodes = detachedSnapshot.nodes.map((node) => {
      const position = frame.positions.get(node.id);
      const velocity = frame.velocities.get(node.id);
      if (position || velocity) updatedNodeIds.push(node.id);
      if (!position) positionFallbackNodeIds.push(node.id);
      if (!velocity) velocityFallbackNodeIds.push(node.id);
      return {
        ...node,
        position: { ...(position ?? node.position) },
        velocity: { ...(velocity ?? node.velocity) }
      };
    });

    return {
      applied: true,
      frameSequence: frame.sequence,
      snapshot: { ...detachedSnapshot, nodes },
      diagnostics: {
        updatedNodeIds,
        positionFallbackNodeIds,
        velocityFallbackNodeIds,
        ignoredFrameNodeIds: Array.from(ignoredFrameNodeIds)
      }
    };
  }
}
