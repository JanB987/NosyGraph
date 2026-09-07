import type { ContainerId, NodeInstanceId } from "./graph-identifiers";
import type { GraphAnchoringFixedCoordinates, GraphContainerAnchorState } from "./GraphContainerAnchoring";

/** Detached seed/current state for the container anchoring stage of a simulation. */
export interface GraphPhysicsAnchoringState {
  anchors: ReadonlyMap<ContainerId, GraphContainerAnchorState>;
  fixedCoordinates: ReadonlyMap<NodeInstanceId, GraphAnchoringFixedCoordinates>;
  /** Captured from max(44, legacy base node radius * 2.2). */
  minimumViewportSize: number;
}

export function copyGraphPhysicsAnchoringState(state: GraphPhysicsAnchoringState): GraphPhysicsAnchoringState {
  return {
    minimumViewportSize: state.minimumViewportSize,
    anchors: new Map(Array.from(state.anchors, ([id, anchor]) => [id, {
      bounds: { ...anchor.bounds }, anchorDirection: { ...anchor.anchorDirection },
      lastOrigin: { ...anchor.lastOrigin }, anchorVelocity: { ...anchor.anchorVelocity },
      collisionPressure: { ...anchor.collisionPressure }
    }])),
    fixedCoordinates: new Map(Array.from(state.fixedCoordinates, ([id, point]) => [id, { ...point }]))
  };
}
