import { describe, expect, it } from "vitest";
import { calculateGraphLinkSpring } from "./GraphLinkSpring";

const first = { id: "A", position: { x: 0, y: 0 }, radius: 10 };

describe("calculateGraphLinkSpring", () => {
  it("uses the gap between node boundaries", () => {
    const result = calculateGraphLinkSpring(
      first,
      { id: "B", position: { x: 140, y: 0 }, radius: 10 },
      { preferredDistance: 100, strength: 0.01 }
    );

    expect(result).toEqual({
      centerDistance: 140,
      boundaryGap: 120,
      displacement: 20,
      force: 0.2,
      firstVelocityDelta: { x: 0.2, y: 0 },
      secondVelocityDelta: { x: -0.2, y: -0 }
    });
  });

  it("pushes overlapping boundaries apart", () => {
    const result = calculateGraphLinkSpring(
      first,
      { id: "B", position: { x: 5, y: 0 }, radius: 10 },
      { preferredDistance: 100, strength: 0.01 }
    );

    expect(result).toMatchObject({ boundaryGap: 0, displacement: -100, force: -1 });
    expect(result.firstVelocityDelta).toEqual({ x: -1, y: -0 });
    expect(result.secondVelocityDelta).toEqual({ x: 1, y: 0 });
  });

  it("clamps attraction and repulsion to the legacy range", () => {
    const attraction = calculateGraphLinkSpring(
      first,
      { id: "B", position: { x: 1000, y: 0 }, radius: 10 },
      { preferredDistance: 10, strength: 1 }
    );
    const repulsion = calculateGraphLinkSpring(
      first,
      { id: "B", position: { x: 1, y: 0 }, radius: 10 },
      { preferredDistance: 100, strength: 1 }
    );

    expect(attraction.force).toBe(5);
    expect(repulsion.force).toBe(-5);
  });

  it("uses a stable non-zero direction for coincident centers", () => {
    const second = { id: "B", position: { x: 0, y: 0 }, radius: 10 };
    const policy = { preferredDistance: 100, strength: 0.01 };
    const one = calculateGraphLinkSpring(first, second, policy);
    const two = calculateGraphLinkSpring(first, second, policy);

    expect(one.centerDistance).toBe(1);
    expect(one.boundaryGap).toBe(0);
    expect(one.firstVelocityDelta).toEqual(two.firstVelocityDelta);
    expect(Math.hypot(
      one.firstVelocityDelta.x,
      one.firstVelocityDelta.y
    )).toBeCloseTo(1);
  });
});
