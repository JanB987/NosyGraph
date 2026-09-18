import { describe, expect, it } from "vitest";
import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";
import { calculateGraphCenterGravity } from "./GraphCenterGravity";

function node(contextId = "graph:root", x = 10, y = -20): GraphPhysicsNode {
  return {
    id: "A", contextId, position: { x, y }, velocity: { x: 0, y: 0 },
    radius: 10, pinned: false
  };
}

const empty: GraphPhysicsContainerState = { containers: [] };

describe("calculateGraphCenterGravity", () => {
  it("pulls ordinary world nodes toward the origin", () => {
    expect(calculateGraphCenterGravity(node(), empty, {
      centerStrength: 0.1,
      restVelocityThreshold: 0.015
    })).toEqual({
      kind: "world",
      velocityDelta: { x: -1, y: 2 }
    });
  });

  it("does not world-center members of a parent container", () => {
    const containers: GraphPhysicsContainerState = {
      containers: [{
        id: "parent", kind: "parent", originNodeId: "A", memberNodeIds: ["A"],
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        parentContainerIds: []
      }]
    };

    expect(calculateGraphCenterGravity(node(), containers, {
      centerStrength: 1,
      restVelocityThreshold: 0.015
    })).toEqual({ kind: "none", velocityDelta: { x: 0, y: 0 } });
  });

  it("uses matching embedded-container center, gravity, and dead zone", () => {
    const containers: GraphPhysicsContainerState = {
      containers: [{
        id: "lens-1", kind: "embedded", originNodeId: "owner", memberNodeIds: ["A"],
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        parentContainerIds: [], gravityStrength: 0.2
      }]
    };
    const result = calculateGraphCenterGravity(
      node("embedded:lens-1", 40, 50),
      containers,
      { centerStrength: 1, restVelocityThreshold: 1 }
    );

    expect(result).toMatchObject({
      kind: "embedded",
      containerId: "lens-1",
      center: { x: 50, y: 50 },
      deadZone: 8,
      velocityDelta: { y: 0 }
    });
    expect(result.kind === "embedded" ? result.velocityDelta.x : undefined)
      .toBeCloseTo(0.4);
  });

  it("produces no embedded gravity inside the minimum dead zone", () => {
    const containers: GraphPhysicsContainerState = {
      containers: [{
        id: "lens-1", kind: "embedded", originNodeId: "owner", memberNodeIds: ["A"],
        bounds: { left: 0, top: 0, right: 10, bottom: 10 },
        parentContainerIds: [], gravityStrength: 1
      }]
    };

    expect(calculateGraphCenterGravity(
      node("embedded:lens-1", 5.2, 5),
      containers,
      { centerStrength: 1, restVelocityThreshold: 0 }
    )).toMatchObject({
      kind: "embedded",
      deadZone: 0.25,
      velocityDelta: { x: 0, y: 0 }
    });
  });

  it("falls back to world centering when an embedded context has no container", () => {
    expect(calculateGraphCenterGravity(node("embedded:missing"), empty, {
      centerStrength: 0.5,
      restVelocityThreshold: 0
    })).toMatchObject({ kind: "world", velocityDelta: { x: -5, y: 10 } });
  });
});
