import type { GraphPoint, GraphVector } from "./GraphNodeInstance";

export interface GraphRepulsionBody {
  position: Readonly<GraphPoint>;
  radius: number;
}

export interface GraphPairwiseRepulsionResult {
  centerDistance: number;
  boundaryDistance: number;
  magnitude: number;
  firstVelocityDelta: Readonly<GraphVector>;
  secondVelocityDelta: Readonly<GraphVector>;
}

/** Reproduces the legacy node-pair repulsion calculation without mutation. */
export function calculateGraphPairwiseRepulsion(
  first: GraphRepulsionBody,
  second: GraphRepulsionBody,
  repulsionStrength: number
): GraphPairwiseRepulsionResult {
  const dx = second.position.x - first.position.x;
  const dy = second.position.y - first.position.y;
  const centerDistance = Math.hypot(dx, dy) || 1;
  const boundaryDistance = Math.max(
    1,
    centerDistance - first.radius - second.radius
  );
  const magnitude = clamp(repulsionStrength / boundaryDistance, 0, 8);
  const forceX = magnitude * (dx / centerDistance);
  const forceY = magnitude * (dy / centerDistance);

  return {
    centerDistance,
    boundaryDistance,
    magnitude,
    firstVelocityDelta: { x: -forceX, y: -forceY },
    secondVelocityDelta: { x: forceX, y: forceY }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
