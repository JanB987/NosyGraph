import { describe, expect, it } from "vitest";
import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import { GraphKinematicsTraceComparator } from "./GraphKinematicsTraceComparator";

function frame(
  sequence: number,
  x: number,
  velocity: number
): GraphKinematicsFrame {
  return {
    sequence,
    structuralRevision: 3,
    positions: new Map([["A", { x, y: 0 }]]),
    velocities: new Map([["A", { x: velocity, y: 0 }]])
  };
}

describe("GraphKinematicsTraceComparator", () => {
  it("compares one-step and multi-step traces with explicit tolerances", () => {
    const comparator = new GraphKinematicsTraceComparator();
    const expected = [frame(10, 1, 1), frame(11, 2, 1)];
    const actual = [frame(10, 1.0005, 1.0005), frame(11, 2.002, 1.001)];

    const oneStep = comparator.compare(expected.slice(0, 1), actual.slice(0, 1), {
      positionTolerance: 0.001,
      velocityTolerance: 0.001
    });
    expect(oneStep).toMatchObject({
      matches: true, expectedStepCount: 1, actualStepCount: 1,
      comparedStepCount: 1, differenceCount: 0
    });
    expect(oneStep.maxPositionDistance).toBeCloseTo(0.0005);
    expect(oneStep.maxVelocityDistance).toBeCloseTo(0.0005);

    const multiStep = comparator.compare(expected, actual, {
      positionTolerance: 0.001,
      velocityTolerance: 0.001
    });
    expect(multiStep).toMatchObject({
      matches: false, expectedStepCount: 2, actualStepCount: 2,
      comparedStepCount: 2, differenceCount: 1
    });
    expect(multiStep.maxPositionDistance).toBeCloseTo(0.002);
    expect(multiStep.maxVelocityDistance).toBeCloseTo(0.001);
  });

  it("reports trace length differences without hiding compared steps", () => {
    const expected = [frame(1, 0, 0), frame(2, 1, 1)];
    const actual = [frame(1, 0, 0)];
    const result = new GraphKinematicsTraceComparator().compare(expected, actual);

    expect(result).toMatchObject({
      matches: false, expectedStepCount: 2, actualStepCount: 1,
      comparedStepCount: 1, differenceCount: 1
    });
  });
});
