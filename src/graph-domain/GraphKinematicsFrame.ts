import type { NodeInstanceId } from "./graph-identifiers";
import type { GraphPoint, GraphVector } from "./GraphNodeInstance";

/** One host-neutral sample of graph-body motion. */
export interface GraphKinematicsFrame {
  /** Advances for every accepted physics frame, independently of graph structure. */
  sequence: number;
  /** Identifies the structural snapshot from which physics calculated this frame. */
  structuralRevision: number;
  positions: ReadonlyMap<NodeInstanceId, Readonly<GraphPoint>>;
  velocities: ReadonlyMap<NodeInstanceId, Readonly<GraphVector>>;
}

/** A frame before its owner assigns the next sequence number. */
export type GraphKinematicsFrameInput = Omit<GraphKinematicsFrame, "sequence">;
