import { describe, expect, it } from "vitest";
import type { GraphKinematicsFrameInput } from "./GraphKinematicsFrame";
import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";
import { GraphContainerConfinement } from "./GraphContainerConfinement";

const node: GraphPhysicsNode = {
  id: "A", contextId: "graph:root", position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 }, radius: 10, pinned: false
};

function frame(x: number, y: number): GraphKinematicsFrameInput {
  return {
    structuralRevision: 3,
    positions: new Map([["A", { x, y }]]),
    velocities: new Map([["A", { x: 2, y: 3 }]])
  };
}

function parentContainers(): GraphPhysicsContainerState {
  return {
    containers: [{
      id: "parent", kind: "parent", originNodeId: "owner", memberNodeIds: ["A"],
      bounds: { left: 0, top: 0, right: 100, bottom: 100 },
      parentContainerIds: []
    }]
  };
}

describe("GraphContainerConfinement", () => {
  it("clamps by radius and asymmetric legacy padding", () => {
    const result = new GraphContainerConfinement().constrain(
      frame(-50, 200),
      [node],
      parentContainers()
    );

    expect(result.frame.positions.get("A")).toEqual({ x: 20, y: 80 });
    expect(result.frame.velocities.get("A")).toEqual({ x: 0, y: 0 });
    expect(result.diagnostics).toMatchObject({ correctedXCount: 1, correctedYCount: 1 });
  });

  it("retains velocity on an axis that did not require correction", () => {
    const result = new GraphContainerConfinement().constrain(
      frame(50, 0),
      [node],
      parentContainers()
    );

    expect(result.frame.positions.get("A")).toEqual({ x: 50, y: 28 });
    expect(result.frame.velocities.get("A")).toEqual({ x: 2, y: 0 });
  });

  it("applies overlapping parent containers in deterministic input order", () => {
    const containers = parentContainers();
    containers.containers = [
      ...containers.containers,
      {
        id: "narrow", kind: "parent", originNodeId: "owner-2", memberNodeIds: ["A"],
        bounds: { left: 40, top: 40, right: 80, bottom: 80 },
        parentContainerIds: []
      }
    ];

    const result = new GraphContainerConfinement().constrain(
      frame(0, 0),
      [node],
      containers
    );
    expect(result.frame.positions.get("A")).toEqual({ x: 60, y: 60 });
    expect(result.diagnostics).toMatchObject({ correctedXCount: 2, correctedYCount: 2 });
  });

  it("keeps embedded raw layout coordinates unchanged", () => {
    const containers: GraphPhysicsContainerState = {
      containers: [{
        id: "lens", kind: "embedded", originNodeId: "owner", memberNodeIds: ["A"],
        bounds: { left: 0, top: 0, right: 10, bottom: 10 },
        parentContainerIds: [], gravityStrength: 0.2
      }]
    };
    const result = new GraphContainerConfinement().constrain(
      frame(1000, -1000),
      [node],
      containers
    );

    expect(result.frame.positions.get("A")).toEqual({ x: 1000, y: -1000 });
    expect(result.frame.velocities.get("A")).toEqual({ x: 2, y: 3 });
    expect(result.diagnostics.embeddedContainerCount).toBe(1);
  });

  it("reports nodes whose frame sample is incomplete", () => {
    const incomplete = frame(0, 0);
    incomplete.velocities = new Map();
    const result = new GraphContainerConfinement().constrain(
      incomplete,
      [node],
      parentContainers()
    );

    expect(result.diagnostics.missingSampleNodeIds).toEqual(["A"]);
  });
});
