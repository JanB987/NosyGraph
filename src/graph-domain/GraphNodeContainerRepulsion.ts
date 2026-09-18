import type { GraphPhysicsContainer } from "./GraphPhysicsContainers";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";
import { deterministicGraphAngle } from "./GraphLinkSpring";
import type { GraphPoint, GraphVector } from "./GraphNodeInstance";

export interface GraphContainerPhysicsCircle extends GraphPoint {
  radius: number;
}

export interface GraphNodeContainerRepulsionResult {
  active: boolean;
  centerDistance: number;
  boundaryDistance: number;
  magnitude: number;
  nodeVelocityDelta: Readonly<GraphVector>;
  originVelocityDelta: Readonly<GraphVector>;
}

/** Resolves the legacy circle used to repel nodes from one container. */
export function resolveGraphContainerPhysicsCircle(
  container: GraphPhysicsContainer,
  origin: GraphPhysicsNode | undefined
): GraphContainerPhysicsCircle {
  if (container.kind === "embedded" && origin) {
    return { ...origin.position, radius: origin.radius };
  }
  const width = Math.max(1, container.bounds.right - container.bounds.left);
  const height = Math.max(1, container.bounds.bottom - container.bounds.top);
  return {
    x: (container.bounds.left + container.bounds.right) / 2,
    y: (container.bounds.top + container.bounds.bottom) / 2,
    radius: Math.max(width, height) / 2
  };
}

/** Calculates equal and opposite legacy node/container-origin repulsion deltas. */
export function calculateGraphNodeContainerRepulsion(
  node: GraphPhysicsNode,
  containerId: string,
  circle: GraphContainerPhysicsCircle,
  repulsionStrength: number,
  influenceDistance: number
): GraphNodeContainerRepulsionResult {
  let dx = node.position.x - circle.x;
  let dy = node.position.y - circle.y;
  let centerDistance = Math.hypot(dx, dy);
  if (centerDistance < 0.001) {
    const angle = deterministicGraphAngle(`${containerId}::${node.id}`);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    centerDistance = 1;
  }
  const boundaryDistance = centerDistance - circle.radius - node.radius;
  if (boundaryDistance > influenceDistance) {
    return {
      active: false,
      centerDistance,
      boundaryDistance,
      magnitude: 0,
      nodeVelocityDelta: { x: 0, y: 0 },
      originVelocityDelta: { x: 0, y: 0 }
    };
  }
  const magnitude = boundaryDistance <= 0
    ? clamp(
        repulsionStrength / Math.max(20, Math.abs(boundaryDistance)),
        0.5,
        8
      )
    : clamp(
        (repulsionStrength / Math.max(1, boundaryDistance))
          * (1 - boundaryDistance / influenceDistance),
        0,
        8
      );
  const forceX = (dx / centerDistance) * magnitude;
  const forceY = (dy / centerDistance) * magnitude;
  return {
    active: true,
    centerDistance,
    boundaryDistance,
    magnitude,
    nodeVelocityDelta: { x: forceX, y: forceY },
    originVelocityDelta: { x: -forceX, y: -forceY }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
