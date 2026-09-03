import { describe, expect, it } from "vitest";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";
import {
  calculateGraphNodeContainerRepulsion,
  resolveGraphContainerPhysicsCircle
} from "./GraphNodeContainerRepulsion";

const node: GraphPhysicsNode = {
  id: "A", contextId: "graph:root", position: { x: 100, y: 0 },
  velocity: { x: 0, y: 0 }, radius: 10, pinned: false
};

describe("GraphNodeContainerRepulsion", () => {
  it("resolves parent circles from bounds", () => {
    expect(resolveGraphContainerPhysicsCircle({
      id: "parent", kind: "parent", originNodeId: "owner", memberNodeIds: [],
      bounds: { left: 0, top: 10, right: 80, bottom: 50 }, parentContainerIds: []
    }, undefined)).toEqual({ x: 40, y: 30, radius: 40 });
  });

  it("resolves embedded circles from their origin node", () => {
    const origin = { ...node, id: "owner", position: { x: 20, y: 30 }, radius: 12 };
    expect(resolveGraphContainerPhysicsCircle({
      id: "lens", kind: "embedded", originNodeId: "owner", memberNodeIds: [],
      bounds: { left: 0, top: 0, right: 500, bottom: 500 },
      parentContainerIds: [], gravityStrength: 0.2
    }, origin)).toEqual({ x: 20, y: 30, radius: 12 });
  });

  it("repels a nearby exterior node and returns the origin reaction", () => {
    const result = calculateGraphNodeContainerRepulsion(
      node,
      "parent",
      { x: 0, y: 0, radius: 40 },
      400,
      120
    );
    expect(result).toMatchObject({
      active: true,
      centerDistance: 100,
      boundaryDistance: 50,
      nodeVelocityDelta: { y: 0 },
      originVelocityDelta: { y: -0 }
    });
    expect(result.magnitude).toBeCloseTo(14 / 3);
    expect(result.nodeVelocityDelta.x).toBeCloseTo(14 / 3);
    expect(result.originVelocityDelta.x).toBeCloseTo(-14 / 3);
  });

  it("fades exterior force to zero at and beyond the influence edge", () => {
    const atEdge = calculateGraphNodeContainerRepulsion(
      { ...node, position: { x: 170, y: 0 } },
      "parent", { x: 0, y: 0, radius: 40 }, 400, 120
    );
    const beyond = calculateGraphNodeContainerRepulsion(
      { ...node, position: { x: 171, y: 0 } },
      "parent", { x: 0, y: 0, radius: 40 }, 400, 120
    );
    expect(atEdge).toMatchObject({ active: true, boundaryDistance: 120, magnitude: 0 });
    expect(beyond).toMatchObject({ active: false, boundaryDistance: 121, magnitude: 0 });
  });

  it("uses deterministic direction and overlap minimum at coincident centers", () => {
    const centered = { ...node, position: { x: 0, y: 0 } };
    const first = calculateGraphNodeContainerRepulsion(
      centered, "parent", { x: 0, y: 0, radius: 40 }, 0, 120
    );
    const second = calculateGraphNodeContainerRepulsion(
      centered, "parent", { x: 0, y: 0, radius: 40 }, 0, 120
    );
    expect(first.magnitude).toBe(0.5);
    expect(first.nodeVelocityDelta).toEqual(second.nodeVelocityDelta);
    expect(Math.hypot(first.nodeVelocityDelta.x, first.nodeVelocityDelta.y)).toBeCloseTo(0.5);
  });
});
