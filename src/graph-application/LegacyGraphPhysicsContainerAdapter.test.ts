import { describe, expect, it } from "vitest";
import { LegacyGraphPhysicsContainerAdapter } from "./LegacyGraphPhysicsContainerAdapter";

describe("LegacyGraphPhysicsContainerAdapter", () => {
  it("maps parent and embedded records without graph-path ancestry", () => {
    const result = new LegacyGraphPhysicsContainerAdapter([
      {
        key: " outer ", kind: "parent", originNodeId: " A ",
        memberNodeIds: ["B"], left: 0, top: 0, right: 200, bottom: 200
      },
      {
        key: "inner", kind: "embedded", originNodeId: "B",
        memberNodeIds: ["C"], left: 20, top: 20, right: 100, bottom: 100,
        linkForce: 0.015
      }
    ]).getContainerCandidates();

    expect(result.containers).toEqual([
      {
        id: "outer", kind: "parent", originNodeId: "A", memberNodeIds: ["B"],
        bounds: { left: 0, top: 0, right: 200, bottom: 200 },
        parentContainerIds: []
      },
      {
        id: "inner", kind: "embedded", originNodeId: "B", memberNodeIds: ["C"],
        bounds: { left: 20, top: 20, right: 100, bottom: 100 },
        parentContainerIds: ["outer"], gravityStrength: 0.015
      }
    ]);
  });

  it("derives overlapping parents when several containers contain the origin", () => {
    const base = (key: string, members: string[]) => ({
      key, kind: "parent" as const, originNodeId: "A", memberNodeIds: members,
      left: 0, top: 0, right: 10, bottom: 10
    });
    const result = new LegacyGraphPhysicsContainerAdapter([
      base("one", ["child-origin"]), base("two", ["child-origin"]),
      { ...base("child", []), originNodeId: "child-origin" }
    ]).getContainerCandidates();
    expect(result.containers[2]?.parentContainerIds).toEqual(["one", "two"]);
  });

  it("detaches member arrays and bounds from the legacy read state", () => {
    const members = ["B"];
    const result = new LegacyGraphPhysicsContainerAdapter([{
      key: "outer", kind: "parent", originNodeId: "A", memberNodeIds: members,
      left: 0, top: 0, right: 10, bottom: 10
    }]).getContainerCandidates();
    (result.containers[0]!.memberNodeIds as string[]).push("changed");
    (result.containers[0]!.bounds as { left: number }).left = 500;
    expect(members).toEqual(["B"]);
  });
});
