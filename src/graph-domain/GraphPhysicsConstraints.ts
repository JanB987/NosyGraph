import type { NodeInstanceId } from "./graph-identifiers";
import type { GraphPoint } from "./GraphNodeInstance";

/** Persisted user intent to keep one node at a stable position. */
export interface GraphPersistentPinConstraint {
  nodeId: NodeInstanceId;
  position: Readonly<GraphPoint>;
}

export type GraphVelocityFreezeReason =
  | "topology-update"
  | "alt-drag"
  | "lens-owner"
  | "dragged-lens-descendant";

/** Short-lived runtime conditions that must not be persisted as pin intent. */
export type GraphTransientNodeConstraint =
  | {
      kind: "position-lock";
      nodeId: NodeInstanceId;
      reason: "focal" | "pin-reposition";
      position: Readonly<GraphPoint>;
    }
  | {
      kind: "drag-target";
      nodeId: NodeInstanceId;
      position: Readonly<GraphPoint>;
    }
  | {
      kind: "direction-target";
      nodeId: NodeInstanceId;
      position: Readonly<GraphPoint>;
    }
  | {
      kind: "velocity-freeze";
      nodeId: NodeInstanceId;
      reason: GraphVelocityFreezeReason;
    };

/** Runtime constraint projection supplied alongside graph physics input. */
export interface GraphPhysicsConstraintState {
  simulationFrozen: boolean;
  persistentPins: readonly GraphPersistentPinConstraint[];
  transientNodeConstraints: readonly GraphTransientNodeConstraint[];
}

export function copyGraphPhysicsConstraintState(
  state: GraphPhysicsConstraintState
): GraphPhysicsConstraintState {
  return {
    simulationFrozen: state.simulationFrozen,
    persistentPins: state.persistentPins.map((pin) => ({
      ...pin,
      position: { ...pin.position }
    })),
    transientNodeConstraints: state.transientNodeConstraints.map((constraint) =>
      "position" in constraint
        ? { ...constraint, position: { ...constraint.position } }
        : { ...constraint }
    )
  };
}
