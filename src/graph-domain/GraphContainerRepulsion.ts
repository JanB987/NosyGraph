import type { GraphPhysicsContainer } from "./GraphPhysicsContainers";
import { deterministicGraphAngle } from "./GraphLinkSpring";
import type { GraphVector } from "./GraphNodeInstance";
import type { GraphContainerPhysicsCircle } from "./GraphNodeContainerRepulsion";

export interface GraphContainerRepulsionBody {
  container: GraphPhysicsContainer;
  circle: GraphContainerPhysicsCircle;
}

export interface GraphContainerRepulsionResult {
  active: boolean;
  centerDistance: number;
  boundaryDistance: number;
  magnitude: number;
  firstOriginVelocityDelta: Readonly<GraphVector>;
  secondOriginVelocityDelta: Readonly<GraphVector>;
}

/** Preserves the legacy membership rules that suppress container-pair repulsion. */
export function shouldGraphContainersRepel(
  first: GraphPhysicsContainer,
  second: GraphPhysicsContainer
): boolean {
  if (first.id === second.id) return false;
  if (
    first.memberNodeIds.includes(second.originNodeId)
    || second.memberNodeIds.includes(first.originNodeId)
  ) return false;
  return !first.memberNodeIds.some((nodeId) => second.memberNodeIds.includes(nodeId));
}

/** Calculates equal and opposite reactions on two container origins. */
export function calculateGraphContainerRepulsion(
  first: GraphContainerRepulsionBody,
  second: GraphContainerRepulsionBody,
  repulsionStrength: number,
  influenceDistance: number
): GraphContainerRepulsionResult {
  const repulsion = Math.max(0, repulsionStrength);
  let dx = second.circle.x - first.circle.x;
  let dy = second.circle.y - first.circle.y;
  let centerDistance = Math.hypot(dx, dy);
  if (centerDistance < 0.001) {
    const angle = deterministicGraphAngle(
      `${first.container.id}::${second.container.id}`
    );
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    centerDistance = 1;
  }
  const boundaryDistance =
    centerDistance - first.circle.radius - second.circle.radius;
  if (repulsion <= 0 || boundaryDistance > influenceDistance) {
    return inactive(centerDistance, boundaryDistance);
  }
  const magnitude = boundaryDistance <= 0
    ? clamp(
        (repulsion / 20)
          * (0.35 + Math.min(1, Math.abs(boundaryDistance) / influenceDistance)),
        0,
        repulsion / 40
      )
    : clamp(
        (repulsion / Math.max(1, boundaryDistance))
          * (1 - boundaryDistance / influenceDistance),
        0,
        repulsion / 40
      );
  const forceX = (dx / centerDistance) * magnitude;
  const forceY = (dy / centerDistance) * magnitude;
  return {
    active: true,
    centerDistance,
    boundaryDistance,
    magnitude,
    firstOriginVelocityDelta: { x: -forceX, y: -forceY },
    secondOriginVelocityDelta: { x: forceX, y: forceY }
  };
}

function inactive(
  centerDistance: number,
  boundaryDistance: number
): GraphContainerRepulsionResult {
  return {
    active: false,
    centerDistance,
    boundaryDistance,
    magnitude: 0,
    firstOriginVelocityDelta: { x: 0, y: 0 },
    secondOriginVelocityDelta: { x: 0, y: 0 }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
