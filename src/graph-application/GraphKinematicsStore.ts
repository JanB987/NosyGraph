import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type {
  GraphKinematicsFrame,
  GraphKinematicsFrameInput
} from "../graph-domain/GraphKinematicsFrame";
import type { GraphPoint, GraphVector } from "../graph-domain/GraphNodeInstance";

export type GraphKinematicsPublishResult =
  | { applied: true; sequence: number }
  | {
      applied: false;
      reason: "sequence-mismatch";
      expectedSequence: number;
      actualSequence: number;
    };

/** Owns rapidly changing positions and velocities separately from graph structure. */
export class GraphKinematicsStore {
  private sequence = 0;
  private structuralRevision: number;
  private positions: Map<NodeInstanceId, GraphPoint>;
  private velocities: Map<NodeInstanceId, GraphVector>;

  constructor(initialFrame: GraphKinematicsFrameInput) {
    this.structuralRevision = initialFrame.structuralRevision;
    this.positions = clonePoints(initialFrame.positions);
    this.velocities = cloneVectors(initialFrame.velocities);
  }

  getSequence(): number {
    return this.sequence;
  }

  getFrame(): GraphKinematicsFrame {
    return {
      sequence: this.sequence,
      structuralRevision: this.structuralRevision,
      positions: clonePoints(this.positions),
      velocities: cloneVectors(this.velocities)
    };
  }

  publishFrame(
    frame: GraphKinematicsFrameInput,
    expectedSequence: number = this.sequence
  ): GraphKinematicsPublishResult {
    if (expectedSequence !== this.sequence) {
      return {
        applied: false,
        reason: "sequence-mismatch",
        expectedSequence,
        actualSequence: this.sequence
      };
    }

    this.structuralRevision = frame.structuralRevision;
    this.positions = clonePoints(frame.positions);
    this.velocities = cloneVectors(frame.velocities);
    this.sequence += 1;
    return { applied: true, sequence: this.sequence };
  }
}

function clonePoints(
  source: ReadonlyMap<NodeInstanceId, Readonly<GraphPoint>>
): Map<NodeInstanceId, GraphPoint> {
  return new Map(Array.from(source, ([id, point]) => [id, { ...point }]));
}

function cloneVectors(
  source: ReadonlyMap<NodeInstanceId, Readonly<GraphVector>>
): Map<NodeInstanceId, GraphVector> {
  return new Map(Array.from(source, ([id, vector]) => [id, { ...vector }]));
}
