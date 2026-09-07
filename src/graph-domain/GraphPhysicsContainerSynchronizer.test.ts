import { describe, expect, it } from "vitest";
import type { GraphPhysicsNode } from "./GraphPhysicsInput";
import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";
import { GraphPhysicsContainerSynchronizer } from "./GraphPhysicsContainerSynchronizer";

const nodes: readonly GraphPhysicsNode[] = [
  { id: "A", contextId: "root", position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, radius: 10, pinned: false },
  { id: "B", contextId: "root", position: { x: 100, y: 50 }, velocity: { x: 0, y: 0 }, radius: 8, pinned: false },
  { id: "C", contextId: "root", position: { x: -20, y: -10 }, velocity: { x: 0, y: 0 }, radius: 12, pinned: false },
  { id: "D", contextId: "root", position: { x: 40, y: 20 }, velocity: { x: 0, y: 0 }, radius: 20, pinned: false }
];

function existing(): GraphPhysicsContainerState {
  return {
    containers: [
      {
        id: "parent",
        kind: "parent",
        originNodeId: "A",
        memberNodeIds: ["old"],
        bounds: { left: 0, top: 0, right: 10, bottom: 10 },
        parentContainerIds: []
      },
      {
        id: "stale",
        kind: "parent",
        originNodeId: "A",
        memberNodeIds: ["B"],
        bounds: { left: 0, top: 0, right: 10, bottom: 10 },
        parentContainerIds: []
      },
      {
        id: "lens",
        kind: "embedded",
        originNodeId: "D",
        memberNodeIds: ["A", "B"],
        bounds: { left: 0, top: 50, right: 200, bottom: 150 },
        parentContainerIds: [],
        gravityStrength: 0.2
      },
      {
        id: "missing-lens",
        kind: "embedded",
        originNodeId: "missing",
        memberNodeIds: [],
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        parentContainerIds: [],
        gravityStrength: 0.2
      }
    ]
  };
}

describe("GraphPhysicsContainerSynchronizer", () => {
  it("recalculates parent bounds from exact requested members and legacy padding floors", () => {
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes,
      existing: { containers: [] },
      parentRequests: [{ id: "parent", originNodeId: "A" }],
      parentMemberships: [
        { containerId: "parent", nodeId: "B" },
        { containerId: "parent", nodeId: "B" },
        { containerId: "parent", nodeId: "C" }
      ],
      baseNodeRadius: 10
    });

    expect(result.state.containers[0]).toEqual({
      id: "parent",
      kind: "parent",
      originNodeId: "A",
      memberNodeIds: ["B", "C"],
      bounds: { left: -38, top: -28, right: 114, bottom: 64 },
      parentContainerIds: []
    });
    expect(result.diagnostics.createdParentIds).toEqual(["parent"]);
    expect(result.diagnostics.recalculatedParentIds).toEqual([]);
  });

  it("uses the base radius for minimum viewport size, not an individual member radius", () => {
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes: [nodes[1]],
      existing: { containers: [] },
      parentRequests: [{ id: "parent", originNodeId: "A" }],
      parentMemberships: [{ containerId: "parent", nodeId: "B" }],
      baseNodeRadius: 30
    });
    expect(result.state.containers[0]?.bounds).toEqual({
      left: 67, top: 17, right: 133, bottom: 83
    });
  });

  it("recalculates embedded dimensions around their existing center", () => {
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes,
      existing: existing(),
      parentRequests: [],
      parentMemberships: [],
      baseNodeRadius: 10
    });
    expect(result.state.containers.find((container) => container.id === "lens")?.bounds).toEqual({
      left: 72, top: 72, right: 128, bottom: 128
    });
    expect(result.diagnostics.recalculatedEmbeddedIds).toEqual(["lens", "missing-lens"]);
    expect(result.diagnostics.missingEmbeddedOriginIds).toEqual(["missing"]);
  });

  it("keeps embedded raw membership and gravity while recalculating its viewport", () => {
    const before = structuredClone(existing());
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes,
      existing: existing(),
      parentRequests: [],
      parentMemberships: [],
      baseNodeRadius: 10
    });
    const lens = result.state.containers.find((container) => container.id === "lens");
    expect(lens).toMatchObject({
      kind: "embedded",
      memberNodeIds: ["A", "B"],
      gravityStrength: 0.2
    });
    expect(existing()).toEqual(before);
  });

  it("removes stale and empty parents while retaining active embedded containers", () => {
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes,
      existing: existing(),
      parentRequests: [
        { id: "parent", originNodeId: "A" },
        { id: "empty", originNodeId: "A" }
      ],
      parentMemberships: [{ containerId: "parent", nodeId: "B" }],
      baseNodeRadius: 10
    });
    expect(result.state.containers.map((container) => container.id)).toEqual([
      "parent", "lens", "missing-lens"
    ]);
    expect(result.diagnostics.removedParentIds).toEqual(["stale"]);
    expect(result.diagnostics.skippedEmptyParentIds).toEqual(["empty"]);
  });

  it("ignores memberships for unknown requests or missing nodes", () => {
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes,
      existing: { containers: [] },
      parentRequests: [{ id: "parent", originNodeId: "A" }],
      parentMemberships: [
        { containerId: "other", nodeId: "B" },
        { containerId: "parent", nodeId: "missing" }
      ],
      baseNodeRadius: 10
    });
    expect(result.state.containers).toEqual([]);
    expect(result.diagnostics.ignoredMemberships).toEqual([
      { containerId: "other", nodeId: "B" },
      { containerId: "parent", nodeId: "missing" }
    ]);
    expect(result.diagnostics.skippedEmptyParentIds).toEqual(["parent"]);
  });

  it("derives ancestry from origin membership after all containers are synchronized", () => {
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes,
      existing: { containers: [] },
      parentRequests: [
        { id: "outer", originNodeId: "A" },
        { id: "inner", originNodeId: "B" }
      ],
      parentMemberships: [
        { containerId: "outer", nodeId: "B" },
        { containerId: "inner", nodeId: "C" }
      ],
      baseNodeRadius: 10
    });
    expect(result.state.containers.find((container) => container.id === "inner")?.parentContainerIds)
      .toEqual(["outer"]);
    expect(result.state.containers.find((container) => container.id === "outer")?.parentContainerIds)
      .toEqual([]);
  });

  it("replaces an embedded record with a requested parent without duplicate IDs", () => {
    const old = existing();
    old.containers = [old.containers.find((container) => container.id === "lens")!];
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes,
      existing: old,
      parentRequests: [{ id: "lens", originNodeId: "A" }],
      parentMemberships: [{ containerId: "lens", nodeId: "B" }],
      baseNodeRadius: 10
    });
    expect(result.state.containers).toHaveLength(1);
    expect(result.state.containers[0]?.kind).toBe("parent");
    expect(result.diagnostics.replacedKindIds).toEqual(["lens"]);
  });

  it("does not mutate nodes, membership, existing containers, or nested arrays", () => {
    const memberships = [{ containerId: "parent", nodeId: "B" }];
    const source = existing();
    const before = structuredClone(source);
    const result = new GraphPhysicsContainerSynchronizer().synchronize({
      nodes,
      existing: source,
      parentRequests: [{ id: "parent", originNodeId: "A" }],
      parentMemberships: memberships,
      baseNodeRadius: 10
    });
    (result.state.containers[0]!.memberNodeIds as string[]).push("changed");
    (result.state.containers[0]!.parentContainerIds as string[]).push("changed");
    expect(source).toEqual(before);
    expect(memberships).toEqual([{ containerId: "parent", nodeId: "B" }]);
    expect(nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });
});
