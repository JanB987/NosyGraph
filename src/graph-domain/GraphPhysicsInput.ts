import type {
  EdgeId,
  GraphContextId,
  LinkTypeId,
  NodeInstanceId
} from "./graph-identifiers";
import type { GraphPoint, GraphVector } from "./GraphNodeInstance";

/** The node data required by physics, without note or rendering concerns. */
export interface GraphPhysicsNode {
  id: NodeInstanceId;
  contextId: GraphContextId;
  position: Readonly<GraphPoint>;
  velocity: Readonly<GraphVector>;
  radius: number;
  pinned: boolean;
}

/** A force-producing relationship between two projected physics nodes. */
export interface GraphPhysicsEdge {
  id: EdgeId;
  fromNodeId: NodeInstanceId;
  toNodeId: NodeInstanceId;
  linkTypeId: LinkTypeId;
  contextId: GraphContextId;
}

/** One complete, versioned input supplied to a host-neutral physics engine. */
export interface GraphPhysicsInput {
  structuralRevision: number;
  frameSequence: number;
  nodes: readonly GraphPhysicsNode[];
  edges: readonly GraphPhysicsEdge[];
}
