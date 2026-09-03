import { describe, expect, it } from "vitest";
import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import { GraphKinematicsFrameComparator } from "./GraphKinematicsFrameComparator";

function frame(
  positions: Array<[string, { x: number; y: number }]>,
  velocities: Array<[string, { x: number; y: number }]> =
    positions.map(([id]) => [id, { x: 0, y: 0 }])
): GraphKinematicsFrame {
  return {
    sequence: 4,
    structuralRevision: 2,
    positions: new Map(positions),
    velocities: new Map(velocities)
  };
}

describe("GraphKinematicsFrameComparator", () => {
  it("compares positions and velocities by identity within separate tolerances", () => {
    const expected = frame([["A", { x: 0, y: 0 }]], [["A", { x: 1, y: 1 }]]);
    const actual = frame([["A", { x: 0.03, y: 0.04 }]], [["A", { x: 1.06, y: 1.08 }]]);

    const comparison = new GraphKinematicsFrameComparator().compare(expected, actual, {
      positionTolerance: 0.05,
      velocityTolerance: 0.09
    });
    expect(comparison).toMatchObject({
      matches: false,
      comparedNodeCount: 1,
      differenceCount: 1,
      reportedDifferences: [{ nodeId: "A", kind: "velocity" }]
    });
    expect(comparison.reportedDifferences[0]?.kind === "velocity"
      ? comparison.reportedDifferences[0].distance
      : undefined).toBeCloseTo(0.1);
  });

  it("reports missing samples and version mismatches explicitly", () => {
    const expected = frame([["A", { x: 0, y: 0 }]]);
    const actual = frame([["B", { x: 0, y: 0 }]]);
    actual.sequence = 5;
    actual.structuralRevision = 3;

    expect(new GraphKinematicsFrameComparator().compare(expected, actual)).toMatchObject({
      matches: false,
      sequenceMatches: false,
      structuralRevisionMatches: false,
      comparedNodeCount: 0,
      differenceCount: 4,
      reportedDifferences: [
        { nodeId: "A", kind: "missing-actual" },
        { nodeId: "B", kind: "missing-expected" }
      ]
    });
  });

  it("bounds details while retaining the total difference count", () => {
    const expected = frame([
      ["C", { x: 0, y: 0 }],
      ["A", { x: 0, y: 0 }],
      ["B", { x: 0, y: 0 }]
    ]);
    const actual = frame([
      ["A", { x: 10, y: 0 }],
      ["B", { x: 10, y: 0 }],
      ["C", { x: 10, y: 0 }]
    ]);

    const comparison = new GraphKinematicsFrameComparator().compare(expected, actual, {
      maxReportedDifferences: 2
    });

    expect(comparison).toMatchObject({ differenceCount: 3, truncated: true });
    expect(comparison.reportedDifferences.map((item) => item.nodeId)).toEqual(["A", "B"]);
  });

  it("treats non-finite motion as a difference", () => {
    const expected = frame([["A", { x: 0, y: 0 }]]);
    const actual = frame([["A", { x: Number.NaN, y: 0 }]]);

    expect(new GraphKinematicsFrameComparator().compare(expected, actual)).toMatchObject({
      matches: false,
      reportedDifferences: [{ nodeId: "A", kind: "position", distance: Number.NaN }]
    });
  });
});
