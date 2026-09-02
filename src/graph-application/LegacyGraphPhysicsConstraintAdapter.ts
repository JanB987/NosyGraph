import type { GraphPoint } from "../graph-domain/GraphNodeInstance";
import type {
  GraphTransientNodeConstraint,
  GraphVelocityFreezeReason
} from "../graph-domain/GraphPhysicsConstraints";
import type { GraphTransientPhysicsConstraintInput } from "./GraphPhysicsConstraintProjector";

export interface LegacyGraphPositionConstraintRead {
  nodeId: string;
  position: Readonly<GraphPoint>;
}

export interface LegacyGraphPhysicsConstraintReadState {
  simulationFrozen: boolean;
  focalLocks: readonly LegacyGraphPositionConstraintRead[];
  pinRepositionLocks: readonly LegacyGraphPositionConstraintRead[];
  dragTargets: readonly LegacyGraphPositionConstraintRead[];
  directionTargets: readonly LegacyGraphPositionConstraintRead[];
  velocityFreezes: Readonly<Partial<Record<GraphVelocityFreezeReason, readonly string[]>>>;
}

export interface LegacyGraphPhysicsConstraintAdaptResult {
  input: GraphTransientPhysicsConstraintInput;
  ignoredEntryCount: number;
}

/** Translates legacy lock/drag/freeze collections into explicit constraint variants. */
export class LegacyGraphPhysicsConstraintAdapter {
  constructor(private readonly source: LegacyGraphPhysicsConstraintReadState) {}

  getConstraintInput(): LegacyGraphPhysicsConstraintAdaptResult {
    const nodeConstraints: GraphTransientNodeConstraint[] = [];
    let ignoredEntryCount = 0;
    const addPosition = (
      entry: LegacyGraphPositionConstraintRead,
      create: (nodeId: string, position: GraphPoint) => GraphTransientNodeConstraint
    ) => {
      const nodeId = normalizeNodeId(entry.nodeId);
      if (!nodeId || !isFinitePoint(entry.position)) {
        ignoredEntryCount += 1;
        return;
      }
      nodeConstraints.push(create(nodeId, { ...entry.position }));
    };

    for (const entry of this.source.focalLocks) {
      addPosition(entry, (nodeId, position) => ({
        kind: "position-lock", nodeId, reason: "focal", position
      }));
    }
    for (const entry of this.source.pinRepositionLocks) {
      addPosition(entry, (nodeId, position) => ({
        kind: "position-lock", nodeId, reason: "pin-reposition", position
      }));
    }
    for (const entry of this.source.dragTargets) {
      addPosition(entry, (nodeId, position) => ({ kind: "drag-target", nodeId, position }));
    }
    for (const entry of this.source.directionTargets) {
      addPosition(entry, (nodeId, position) => ({ kind: "direction-target", nodeId, position }));
    }
    for (const reason of [
      "topology-update", "alt-drag", "lens-owner", "dragged-lens-descendant"
    ] as const) {
      for (const rawNodeId of this.source.velocityFreezes[reason] ?? []) {
        const nodeId = normalizeNodeId(rawNodeId);
        if (!nodeId) {
          ignoredEntryCount += 1;
          continue;
        }
        nodeConstraints.push({ kind: "velocity-freeze", nodeId, reason });
      }
    }

    return {
      input: { simulationFrozen: this.source.simulationFrozen, nodeConstraints },
      ignoredEntryCount
    };
  }
}

function normalizeNodeId(value: string): string {
  return String(value ?? "").trim();
}

function isFinitePoint(point: Readonly<GraphPoint>): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
