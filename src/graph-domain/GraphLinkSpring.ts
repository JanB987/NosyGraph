import type { NodeInstanceId } from "./graph-identifiers";
import type { GraphPoint, GraphVector } from "./GraphNodeInstance";

export interface GraphSpringBody {
  id: NodeInstanceId;
  position: Readonly<GraphPoint>;
  radius: number;
}

export interface GraphLinkSpringPolicy {
  preferredDistance: number;
  strength: number;
}

export interface GraphLinkSpringResult {
  centerDistance: number;
  boundaryGap: number;
  displacement: number;
  force: number;
  firstVelocityDelta: Readonly<GraphVector>;
  secondVelocityDelta: Readonly<GraphVector>;
}

/** Reproduces the legacy boundary-based link spring without mutation. */
export function calculateGraphLinkSpring(
  first: GraphSpringBody,
  second: GraphSpringBody,
  policy: GraphLinkSpringPolicy
): GraphLinkSpringResult {
  let dx = second.position.x - first.position.x;
  let dy = second.position.y - first.position.y;
  let centerDistance = Math.hypot(dx, dy);
  if (centerDistance < 0.001) {
    const angle = deterministicGraphAngle(`${first.id}::${second.id}`);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    centerDistance = 1;
  }
  const directionX = dx / centerDistance;
  const directionY = dy / centerDistance;
  const boundaryGap = Math.max(
    0,
    centerDistance - first.radius - second.radius
  );
  const displacement = boundaryGap - policy.preferredDistance;
  const force = clamp(policy.strength * displacement, -5, 5);
  const forceX = directionX * force;
  const forceY = directionY * force;

  return {
    centerDistance,
    boundaryGap,
    displacement,
    force,
    firstVelocityDelta: { x: forceX, y: forceY },
    secondVelocityDelta: { x: -forceX, y: -forceY }
  };
}

/** Stable FNV-1a angle shared by overlap-sensitive force calculations. */
export function deterministicGraphAngle(seedRaw: string): number {
  const seed = String(seedRaw ?? "");
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
