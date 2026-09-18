import { describe, expect, it } from "vitest";
import {
  copyGraphPhysicsContainerState,
  type GraphPhysicsContainerState
} from "./GraphPhysicsContainers";

function state(): GraphPhysicsContainerState {
  return {
    containers: [
      {
        id: "parent:A::parts",
        kind: "parent",
        originNodeId: "A",
        memberNodeIds: ["B", "C"],
        bounds: { left: 0, top: 0, right: 200, bottom: 100 },
        parentContainerIds: []
      },
      {
        id: "embedded:A::graph",
        kind: "embedded",
        originNodeId: "A",
        memberNodeIds: ["D"],
        bounds: { left: 20, top: 20, right: 180, bottom: 80 },
        parentContainerIds: ["parent:A::parts"],
        gravityStrength: 0.015
      }
    ]
  };
}

describe("GraphPhysicsContainerState", () => {
  it("represents overlapping and nested membership by stable IDs", () => {
    const containers = state().containers;
    expect(containers[0]?.memberNodeIds).toEqual(["B", "C"]);
    expect(containers[1]).toMatchObject({
      kind: "embedded",
      parentContainerIds: ["parent:A::parts"],
      gravityStrength: 0.015
    });
  });

  it("copies membership, bounds, and ancestry arrays", () => {
    const source = state();
    const copy = copyGraphPhysicsContainerState(source);
    (copy.containers[0]!.memberNodeIds as string[]).push("changed");
    (copy.containers[0]!.bounds as { left: number }).left = 500;
    (copy.containers[1]!.parentContainerIds as string[]).push("changed");

    expect(source.containers[0]?.memberNodeIds).toEqual(["B", "C"]);
    expect(source.containers[0]?.bounds.left).toBe(0);
    expect(source.containers[1]?.parentContainerIds).toEqual(["parent:A::parts"]);
  });
});
