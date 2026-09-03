import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";

export interface GraphKinematicsFrameSummary {
  sequence: number;
  structuralRevision: number;
  positionCount: number;
  velocityCount: number;
  matchedNodeCount: number;
  invalidSampleCount: number;
  centroidX: number | null;
  centroidY: number | null;
  meanSpeed: number | null;
  maxSpeed: number | null;
}

export interface GraphKinematicsFrameDifference {
  field: keyof GraphKinematicsFrameSummary;
  expected: number | null;
  actual: number | null;
}

export interface GraphKinematicsFrameComparison {
  matches: boolean;
  tolerance: number;
  differences: readonly GraphKinematicsFrameDifference[];
}

/** Summarizes frame health and compares aggregate motion with numeric tolerance. */
export class GraphKinematicsFrameDiagnostics {
  summarize(frame: GraphKinematicsFrame): GraphKinematicsFrameSummary {
    const nodeIds = new Set([...frame.positions.keys(), ...frame.velocities.keys()]);
    let invalidSampleCount = 0;
    let matchedNodeCount = 0;
    let totalX = 0;
    let totalY = 0;
    let totalSpeed = 0;
    let maxSpeed = 0;

    for (const nodeId of nodeIds) {
      const position = frame.positions.get(nodeId);
      const velocity = frame.velocities.get(nodeId);
      if (!position || !velocity || !isFinitePair(position) || !isFinitePair(velocity)) {
        invalidSampleCount += 1;
        continue;
      }
      const speed = Math.hypot(velocity.x, velocity.y);
      matchedNodeCount += 1;
      totalX += position.x;
      totalY += position.y;
      totalSpeed += speed;
      maxSpeed = Math.max(maxSpeed, speed);
    }

    return {
      sequence: frame.sequence,
      structuralRevision: frame.structuralRevision,
      positionCount: frame.positions.size,
      velocityCount: frame.velocities.size,
      matchedNodeCount,
      invalidSampleCount,
      centroidX: matchedNodeCount > 0 ? totalX / matchedNodeCount : null,
      centroidY: matchedNodeCount > 0 ? totalY / matchedNodeCount : null,
      meanSpeed: matchedNodeCount > 0 ? totalSpeed / matchedNodeCount : null,
      maxSpeed: matchedNodeCount > 0 ? maxSpeed : null
    };
  }

  compare(
    expected: GraphKinematicsFrameSummary,
    actual: GraphKinematicsFrameSummary,
    tolerance = 0.001
  ): GraphKinematicsFrameComparison {
    const normalizedTolerance = Number.isFinite(tolerance)
      ? Math.max(0, tolerance)
      : 0.001;
    const differences: GraphKinematicsFrameDifference[] = [];
    const approximateFields = new Set<keyof GraphKinematicsFrameSummary>([
      "centroidX", "centroidY", "meanSpeed", "maxSpeed"
    ]);

    for (const field of Object.keys(expected) as Array<keyof GraphKinematicsFrameSummary>) {
      const expectedValue = expected[field];
      const actualValue = actual[field];
      const matches = approximateFields.has(field)
        ? approximatelyEqual(expectedValue, actualValue, normalizedTolerance)
        : expectedValue === actualValue;
      if (!matches) differences.push({ field, expected: expectedValue, actual: actualValue });
    }

    return {
      matches: differences.length === 0,
      tolerance: normalizedTolerance,
      differences
    };
  }
}

function isFinitePair(value: { x: number; y: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function approximatelyEqual(
  expected: number | null,
  actual: number | null,
  tolerance: number
): boolean {
  if (expected === null || actual === null) return expected === actual;
  return Math.abs(expected - actual) <= tolerance;
}
