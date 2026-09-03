import { describe, expect, it } from "vitest";
import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import { GraphKinematicsFrameDiagnostics } from "./GraphKinematicsFrameDiagnostics";

function frame(): GraphKinematicsFrame {
  return {
    sequence: 8,
    structuralRevision: 3,
    positions: new Map([
      ["A", { x: 0, y: 0 }],
      ["B", { x: 10, y: 20 }],
      ["position-only", { x: 5, y: 5 }]
    ]),
    velocities: new Map([
      ["A", { x: 3, y: 4 }],
      ["B", { x: 0, y: 0 }],
      ["velocity-only", { x: 1, y: 1 }]
    ])
  };
}

describe("GraphKinematicsFrameDiagnostics", () => {
  it("summarizes matched finite samples and reports incomplete samples", () => {
    const summary = new GraphKinematicsFrameDiagnostics().summarize(frame());

    expect(summary).toEqual({
      sequence: 8,
      structuralRevision: 3,
      positionCount: 3,
      velocityCount: 3,
      matchedNodeCount: 2,
      invalidSampleCount: 2,
      centroidX: 5,
      centroidY: 10,
      meanSpeed: 2.5,
      maxSpeed: 5
    });
  });

  it("uses tolerance only for aggregate motion values", () => {
    const diagnostics = new GraphKinematicsFrameDiagnostics();
    const expected = diagnostics.summarize(frame());
    const withinTolerance = { ...expected, centroidX: 5.005 };
    const wrongVersion = { ...withinTolerance, sequence: 9 };

    expect(diagnostics.compare(expected, withinTolerance, 0.01)).toEqual({
      matches: true,
      tolerance: 0.01,
      differences: []
    });
    expect(diagnostics.compare(expected, wrongVersion, 0.01)).toMatchObject({
      matches: false,
      differences: [{ field: "sequence", expected: 8, actual: 9 }]
    });
  });

  it("reports non-finite pairs without contaminating aggregate values", () => {
    const invalid = frame();
    invalid.positions = new Map([["A", { x: Number.NaN, y: 0 }]]);
    invalid.velocities = new Map([["A", { x: 1, y: 0 }]]);

    expect(new GraphKinematicsFrameDiagnostics().summarize(invalid)).toMatchObject({
      matchedNodeCount: 0,
      invalidSampleCount: 1,
      centroidX: null,
      meanSpeed: null
    });
  });
});
