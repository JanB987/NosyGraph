import type { ContainerId, NodeInstanceId } from "./graph-identifiers";
import type { GraphRectangle } from "./GraphLens";

interface GraphPhysicsContainerBase {
  id: ContainerId;
  originNodeId: NodeInstanceId;
  memberNodeIds: readonly NodeInstanceId[];
  bounds: Readonly<GraphRectangle>;
  parentContainerIds: readonly ContainerId[];
}

export interface GraphParentPhysicsContainer extends GraphPhysicsContainerBase {
  kind: "parent";
}

export interface GraphEmbeddedPhysicsContainer extends GraphPhysicsContainerBase {
  kind: "embedded";
  gravityStrength: number;
}

export type GraphPhysicsContainer =
  | GraphParentPhysicsContainer
  | GraphEmbeddedPhysicsContainer;

/** Detached spatial membership and boundary constraints used by physics. */
export interface GraphPhysicsContainerState {
  containers: readonly GraphPhysicsContainer[];
}

export function copyGraphPhysicsContainerState(
  state: GraphPhysicsContainerState
): GraphPhysicsContainerState {
  return {
    containers: state.containers.map((container) => ({
      ...container,
      memberNodeIds: [...container.memberNodeIds],
      bounds: { ...container.bounds },
      parentContainerIds: [...container.parentContainerIds]
    }))
  };
}
