import { describe, expect, it } from "vitest";
import { calculateGraphPairwiseRepulsion } from "./GraphPairwiseRepulsion";

describe("calculateGraphPairwiseRepulsion", () => {
  it("uses boundary distance and the legacy maximum magnitude", () => {
    const result = calculateGraphPairwiseRepulsion(
      { position: { x: 0, y: 0 }, radius: 10 },
      { position: { x: 100, y: 0 }, radius: 10 },
      4000
    );

    expect(result).toEqual({
      centerDistance: 100,
      boundaryDistance: 80,
      magnitude: 8,
      firstVelocityDelta: { x: -8, y: -0 },
      secondVelocityDelta: { x: 8, y: 0 }
    });
  });

  it("preserves inverse boundary-distance force below the clamp", () => {
    const result = calculateGraphPairwiseRepulsion(
      { position: { x: 0, y: 0 }, radius: 10 },
      { position: { x: 1020, y: 0 }, radius: 10 },
      4000
    );

    expect(result.boundaryDistance).toBe(1000);
    expect(result.magnitude).toBe(4);
    expect(result.firstVelocityDelta.x).toBe(-4);
  });

  it("clamps overlapping boundaries to one unit", () => {
    const result = calculateGraphPairwiseRepulsion(
      { position: { x: 0, y: 0 }, radius: 20 },
      { position: { x: 5, y: 0 }, radius: 20 },
      10
    );

    expect(result.boundaryDistance).toBe(1);
    expect(result.magnitude).toBe(8);
  });

  it("preserves the legacy zero-direction behavior for identical centers", () => {
    const result = calculateGraphPairwiseRepulsion(
      { position: { x: 1, y: 1 }, radius: 10 },
      { position: { x: 1, y: 1 }, radius: 10 },
      4000
    );

    expect(result).toMatchObject({
      centerDistance: 1,
      boundaryDistance: 1,
      magnitude: 8,
      firstVelocityDelta: { x: -0, y: -0 },
      secondVelocityDelta: { x: 0, y: 0 }
    });
  });

  it("turns non-positive strength into zero force", () => {
    const result = calculateGraphPairwiseRepulsion(
      { position: { x: 0, y: 0 }, radius: 10 },
      { position: { x: 50, y: 0 }, radius: 10 },
      -5
    );

    expect(result.magnitude).toBe(0);
    expect(result.firstVelocityDelta).toEqual({ x: -0, y: -0 });
    expect(result.secondVelocityDelta).toEqual({ x: 0, y: 0 });
  });
});
