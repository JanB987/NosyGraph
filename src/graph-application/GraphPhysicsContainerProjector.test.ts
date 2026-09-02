import { describe, expect, it } from "vitest";
import type { GraphPhysicsContainerState } from "../graph-domain/GraphPhysicsContainers";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphPhysicsContainerProjector } from "./GraphPhysicsContainerProjector";

function snapshot(): GraphSnapshot {
  const node = (id: string): GraphSnapshot["nodes"][number] => ({
    id,
    noteId: `${id}.md`,
    contextId: "graph:root",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    radius: 10,
    pinned: false,
    selected: false,
    origin: { kind: "root" }
  });
  return {
    notes: [], nodes: [node("A"), node("B"), node("C")],
    edges: [], badges: [], expansions: [], lenses: []
  };
}

function candidates(): GraphPhysicsContainerState {
  return {
    containers: [
      {
        id: "outer", kind: "parent", originNodeId: "A",
        memberNodeIds: ["B", "B", "missing"],
        bounds: { left: 0, top: 0, right: 200, bottom: 200 },
        parentContainerIds: ["inner", "missing-container"]
      },
      {
        id: "inner", kind: "embedded", originNodeId: "B",
        memberNodeIds: ["C"],
        bounds: { left: 20, top: 20, right: 100, bottom: 100 },
        parentContainerIds: ["outer", "inner"],
        gravityStrength: 2
      },
      {
        id: "bad-origin", kind: "parent", originNodeId: "missing",
        memberNodeIds: [], bounds: { left: 0, top: 0, right: 1, bottom: 1 },
        parentContainerIds: []
      },
      {
        id: "bad-bounds", kind: "parent", originNodeId: "A",
        memberNodeIds: [], bounds: { left: 2, top: 0, right: 1, bottom: 1 },
        parentContainerIds: []
      }
    ]
  };
}

describe("GraphPhysicsContainerProjector", () => {
  it("keeps valid containers and reports invalid containers and members", () => {
    const result = new GraphPhysicsContainerProjector().project(snapshot(), candidates());

    expect(result.state.containers).toHaveLength(2);
    expect(result.state.containers[0]?.memberNodeIds).toEqual(["B"]);
    expect(result.state.containers[1]).toMatchObject({ gravityStrength: 1 });
    expect(result.diagnostics.rejectedContainers).toEqual([
      { containerId: "bad-origin", reason: "missing-origin" },
      { containerId: "bad-bounds", reason: "invalid-bounds" }
    ]);
    expect(result.diagnostics.ignoredMemberReferences).toEqual([
      { containerId: "outer", nodeId: "missing" }
    ]);
  });

  it("rejects missing, self, and cycle-forming ancestry references", () => {
    const result = new GraphPhysicsContainerProjector().project(snapshot(), candidates());

    expect(result.state.containers[0]?.parentContainerIds).toEqual(["inner"]);
    expect(result.state.containers[1]?.parentContainerIds).toEqual([]);
    expect(result.diagnostics.ignoredParentReferences).toEqual([
      {
        containerId: "outer", parentContainerId: "missing-container",
        reason: "missing-container"
      },
      { containerId: "inner", parentContainerId: "outer", reason: "cycle" },
      { containerId: "inner", parentContainerId: "inner", reason: "self-reference" }
    ]);
  });

  it("returns detached membership and bounds", () => {
    const source = candidates();
    const result = new GraphPhysicsContainerProjector().project(snapshot(), source);
    (result.state.containers[0]!.memberNodeIds as string[]).push("changed");
    (result.state.containers[0]!.bounds as { left: number }).left = 500;

    expect(source.containers[0]?.memberNodeIds).toEqual(["B", "B", "missing"]);
    expect(source.containers[0]?.bounds.left).toBe(0);
  });
});
