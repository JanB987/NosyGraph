import type {
  GraphPhysicsConstraintState,
  GraphTransientNodeConstraint
} from "../graph-domain/GraphPhysicsConstraints";
import {
  copyGraphPhysicsConstraintState,
  copyGraphTransientNodeConstraint
} from "../graph-domain/GraphPhysicsConstraints";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";

export interface GraphTransientPhysicsConstraintInput {
  simulationFrozen: boolean;
  nodeConstraints: readonly GraphTransientNodeConstraint[];
}

export interface GraphPhysicsConstraintProjectionResult {
  state: GraphPhysicsConstraintState;
  diagnostics: {
    ignoredTransientConstraints: readonly GraphTransientNodeConstraint[];
  };
}

/** Combines semantic pin intent with current transient runtime constraints. */
export class GraphPhysicsConstraintProjector {
  project(
    snapshot: GraphSnapshot,
    transient: GraphTransientPhysicsConstraintInput
  ): GraphPhysicsConstraintProjectionResult {
    const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
    const acceptedConstraints: GraphTransientNodeConstraint[] = [];
    const ignoredConstraints: GraphTransientNodeConstraint[] = [];
    for (const constraint of transient.nodeConstraints) {
      (nodeIds.has(constraint.nodeId) ? acceptedConstraints : ignoredConstraints)
        .push(constraint);
    }

    const state = copyGraphPhysicsConstraintState({
      simulationFrozen: transient.simulationFrozen,
      persistentPins: snapshot.nodes
        .filter((node) => node.pinned)
        .map((node) => ({
          nodeId: node.id,
          position: { ...node.position }
        })),
      transientNodeConstraints: acceptedConstraints
    });

    return {
      state,
      diagnostics: {
        ignoredTransientConstraints: ignoredConstraints.map(
          copyGraphTransientNodeConstraint
        )
      }
    };
  }
}
