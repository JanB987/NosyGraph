import type { NodeInstanceId } from "./graph-identifiers";
import type { GraphKinematicsFrameInput } from "./GraphKinematicsFrame";
import type { GraphPoint, GraphVector } from "./GraphNodeInstance";
import type { GraphPhysicsRuntimeInput } from "./GraphPhysicsRuntimeInput";

export type GraphMotionIntegrationOutcome =
  | "simulation-frozen"
  | "velocity-frozen"
  | "direction-target"
  | "position-lock"
  | "persistent-pin"
  | "drag-target"
  | "integrated";

export interface GraphMotionIntegrationResult {
  frame: GraphKinematicsFrameInput;
  maxVelocity: number;
  outcomes: ReadonlyMap<NodeInstanceId, GraphMotionIntegrationOutcome>;
}

/** Applies legacy constraint priority, damping, and one position-integration tick. */
export class GraphMotionIntegrator {
  integrate(
    input: GraphPhysicsRuntimeInput,
    velocityDeltas: ReadonlyMap<NodeInstanceId, Readonly<GraphVector>>
  ): GraphMotionIntegrationResult {
    const positions = new Map<NodeInstanceId, GraphPoint>();
    const velocities = new Map<NodeInstanceId, GraphVector>();
    const outcomes = new Map<NodeInstanceId, GraphMotionIntegrationOutcome>();
    const constraints = indexConstraints(input);
    let maxVelocity = 0;

    for (const node of input.graph.nodes) {
      let position = { ...node.position };
      let velocity = { ...node.velocity };
      let outcome: GraphMotionIntegrationOutcome;

      if (input.constraints.simulationFrozen) {
        outcome = "simulation-frozen";
      } else if (
        constraints.topologyFrozen.has(node.id)
        || constraints.draggedLensDescendant.has(node.id)
        || (constraints.lensOwner.has(node.id) && !constraints.dragTargets.has(node.id))
      ) {
        velocity = { x: 0, y: 0 };
        outcome = "velocity-frozen";
      } else if (
        constraints.directionTargets.has(node.id)
        && !constraints.dragTargets.has(node.id)
      ) {
        position = { ...constraints.directionTargets.get(node.id)! };
        velocity = { x: 0, y: 0 };
        outcome = "direction-target";
      } else if (constraints.positionLocks.has(node.id)) {
        position = { ...constraints.positionLocks.get(node.id)! };
        velocity = { x: 0, y: 0 };
        outcome = "position-lock";
      } else if (constraints.persistentPins.has(node.id)) {
        position = { ...constraints.persistentPins.get(node.id)! };
        velocity = { x: 0, y: 0 };
        outcome = "persistent-pin";
      } else if (constraints.altDragFrozen.has(node.id)) {
        velocity = { x: 0, y: 0 };
        outcome = "velocity-frozen";
      } else if (constraints.dragTargets.has(node.id)) {
        position = { ...constraints.dragTargets.get(node.id)! };
        outcome = "drag-target";
      } else {
        const delta = velocityDeltas.get(node.id) ?? { x: 0, y: 0 };
        velocity = {
          x: (velocity.x + delta.x) * input.settings.damping,
          y: (velocity.y + delta.y) * input.settings.damping
        };
        position = {
          x: position.x + velocity.x,
          y: position.y + velocity.y
        };
        maxVelocity = Math.max(maxVelocity, Math.hypot(velocity.x, velocity.y));
        outcome = "integrated";
      }

      positions.set(node.id, position);
      velocities.set(node.id, velocity);
      outcomes.set(node.id, outcome);
    }

    return {
      frame: {
        structuralRevision: input.graph.structuralRevision,
        positions,
        velocities
      },
      maxVelocity,
      outcomes
    };
  }
}

function indexConstraints(input: GraphPhysicsRuntimeInput) {
  const persistentPins = new Map(
    input.constraints.persistentPins.map((item) => [item.nodeId, item.position])
  );
  const positionLocks = new Map<NodeInstanceId, Readonly<GraphPoint>>();
  const dragTargets = new Map<NodeInstanceId, Readonly<GraphPoint>>();
  const directionTargets = new Map<NodeInstanceId, Readonly<GraphPoint>>();
  const topologyFrozen = new Set<NodeInstanceId>();
  const altDragFrozen = new Set<NodeInstanceId>();
  const lensOwner = new Set<NodeInstanceId>();
  const draggedLensDescendant = new Set<NodeInstanceId>();

  for (const constraint of input.constraints.transientNodeConstraints) {
    if (constraint.kind === "position-lock") {
      positionLocks.set(constraint.nodeId, constraint.position);
    } else if (constraint.kind === "drag-target") {
      dragTargets.set(constraint.nodeId, constraint.position);
    } else if (constraint.kind === "direction-target") {
      directionTargets.set(constraint.nodeId, constraint.position);
    } else if (constraint.reason === "topology-update") {
      topologyFrozen.add(constraint.nodeId);
    } else if (constraint.reason === "alt-drag") {
      altDragFrozen.add(constraint.nodeId);
    } else if (constraint.reason === "lens-owner") {
      lensOwner.add(constraint.nodeId);
    } else {
      draggedLensDescendant.add(constraint.nodeId);
    }
  }

  return {
    persistentPins,
    positionLocks,
    dragTargets,
    directionTargets,
    topologyFrozen,
    altDragFrozen,
    lensOwner,
    draggedLensDescendant
  };
}
