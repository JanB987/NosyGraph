import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";
import type { GraphPoint, GraphVector } from "./GraphNodeInstance";

export type GraphCenterGravityResult =
  | { kind: "none"; velocityDelta: Readonly<GraphVector> }
  | { kind: "world"; velocityDelta: Readonly<GraphVector> }
  | {
      kind: "embedded";
      containerId: string;
      center: Readonly<GraphPoint>;
      deadZone: number;
      velocityDelta: Readonly<GraphVector>;
    };

export interface GraphCenterGravitySettings {
  centerStrength: number;
  restVelocityThreshold: number;
}

/** Selects and calculates legacy world or embedded-container centering for one node. */
export function calculateGraphCenterGravity(
  node: GraphPhysicsNode,
  containers: GraphPhysicsContainerState,
  settings: GraphCenterGravitySettings
): GraphCenterGravityResult {
  const embedded = containers.containers.find((container) =>
    container.kind === "embedded"
    && node.contextId === `embedded:${container.id}`
  );
  if (embedded?.kind === "embedded") {
    const center = {
      x: (embedded.bounds.left + embedded.bounds.right) / 2,
      y: (embedded.bounds.top + embedded.bounds.bottom) / 2
    };
    const deadZone = Math.max(settings.restVelocityThreshold * 8, 0.25);
    return {
      kind: "embedded",
      containerId: embedded.id,
      center,
      deadZone,
      velocityDelta: calculateEmbeddedGravity(
        node.position,
        center,
        embedded.gravityStrength,
        deadZone
      )
    };
  }

  const insideParent = containers.containers.some((container) =>
    container.kind === "parent" && container.memberNodeIds.includes(node.id)
  );
  return insideParent
    ? { kind: "none", velocityDelta: { x: 0, y: 0 } }
    : {
        kind: "world",
        velocityDelta: {
          x: -node.position.x * settings.centerStrength,
          y: -node.position.y * settings.centerStrength
        }
      };
}

function calculateEmbeddedGravity(
  position: Readonly<GraphPoint>,
  center: Readonly<GraphPoint>,
  gravityStrength: number,
  deadZone: number
): GraphVector {
  const dx = center.x - position.x;
  const dy = center.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= deadZone) return { x: 0, y: 0 };
  const forceScale = ((distance - deadZone) / distance) * gravityStrength;
  return { x: dx * forceScale, y: dy * forceScale };
}
