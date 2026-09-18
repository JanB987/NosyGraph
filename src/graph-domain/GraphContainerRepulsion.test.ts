import { describe, expect, it } from "vitest";
import type { GraphPhysicsContainer } from "./GraphPhysicsContainers";
import {
  calculateGraphContainerRepulsion,
  shouldGraphContainersRepel
} from "./GraphContainerRepulsion";

function container(id: string, originNodeId: string, members: string[] = []): GraphPhysicsContainer {
  return {
    id, kind: "parent", originNodeId, memberNodeIds: members,
    bounds: { left: 0, top: 0, right: 20, bottom: 20 },
    parentContainerIds: []
  };
}

describe("GraphContainerRepulsion", () => {
  it("suppresses same, nested-origin, and shared-member containers", () => {
    const first = container("one", "A", ["child", "shared"]);
    expect(shouldGraphContainersRepel(first, first)).toBe(false);
    expect(shouldGraphContainersRepel(first, container("two", "child"))).toBe(false);
    expect(shouldGraphContainersRepel(first, container("two", "B", ["shared"]))).toBe(false);
    expect(shouldGraphContainersRepel(first, container("two", "B", ["other"]))).toBe(true);
  });

  it("fades exterior container force over its influence distance", () => {
    const result = calculateGraphContainerRepulsion(
      { container: container("one", "A"), circle: { x: 0, y: 0, radius: 20 } },
      { container: container("two", "B"), circle: { x: 60, y: 0, radius: 20 } },
      400,
      40
    );
    expect(result).toMatchObject({
      active: true,
      centerDistance: 60,
      boundaryDistance: 20,
      magnitude: 10,
      firstOriginVelocityDelta: { x: -10, y: -0 },
      secondOriginVelocityDelta: { x: 10, y: 0 }
    });
  });

  it("caps overlap force at one fortieth of repulsion", () => {
    const result = calculateGraphContainerRepulsion(
      { container: container("one", "A"), circle: { x: 0, y: 0, radius: 30 } },
      { container: container("two", "B"), circle: { x: 10, y: 0, radius: 30 } },
      4000,
      36
    );
    expect(result.boundaryDistance).toBe(-50);
    expect(result.magnitude).toBe(100);
  });

  it("returns inactive force for non-positive repulsion or distant containers", () => {
    const first = { container: container("one", "A"), circle: { x: 0, y: 0, radius: 10 } };
    const second = { container: container("two", "B"), circle: { x: 100, y: 0, radius: 10 } };
    expect(calculateGraphContainerRepulsion(first, second, 0, 100).active).toBe(false);
    expect(calculateGraphContainerRepulsion(first, second, 100, 36).active).toBe(false);
  });

  it("uses deterministic direction for coincident centers", () => {
    const first = { container: container("one", "A"), circle: { x: 0, y: 0, radius: 10 } };
    const second = { container: container("two", "B"), circle: { x: 0, y: 0, radius: 10 } };
    const one = calculateGraphContainerRepulsion(first, second, 400, 36);
    const two = calculateGraphContainerRepulsion(first, second, 400, 36);
    expect(one.firstOriginVelocityDelta).toEqual(two.firstOriginVelocityDelta);
    expect(Math.hypot(
      one.firstOriginVelocityDelta.x,
      one.firstOriginVelocityDelta.y
    )).toBeCloseTo(one.magnitude);
  });
});
