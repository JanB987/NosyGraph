import { describe, expect, it } from "vitest";
import { normalizeGraphPhysicsSettings } from "./GraphPhysicsSettings";
import type { GraphPhysicsRuntimeInput } from "./GraphPhysicsRuntimeInput";
import { GraphForceAccumulator } from "./GraphForceAccumulator";

function input(): GraphPhysicsRuntimeInput {
  return {
    graph: {
      structuralRevision: 1,
      frameSequence: 0,
      nodes: [
        {
          id: "A", contextId: "graph:root", position: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 }, radius: 10, pinned: false
        },
        {
          id: "B", contextId: "graph:root", position: { x: 140, y: 0 },
          velocity: { x: 0, y: 0 }, radius: 10, pinned: false
        }
      ],
      edges: [{
        id: "A-B", fromNodeId: "A", toNodeId: "B",
        linkTypeId: "parts", contextId: "graph:root"
      }]
    },
    settings: normalizeGraphPhysicsSettings({
      repulsionStrength: 4000,
      linkPolicies: new Map([["parts", {
        activeDefinition: { preferredDistance: 100, strength: 0.01 }
      }]])
    }),
    constraints: {
      simulationFrozen: false,
      persistentPins: [],
      transientNodeConstraints: []
    },
    containers: { containers: [] }
  };
}

describe("GraphForceAccumulator", () => {
  it("combines pair repulsion and boundary spring deltas", () => {
    const result = new GraphForceAccumulator().accumulate(input());

    expect(result.velocityDeltas.get("A")?.x).toBeCloseTo(-7.8);
    expect(result.velocityDeltas.get("B")?.x).toBeCloseTo(7.8);
    expect(result.velocityDeltas.get("A")?.y).toBe(0);
  });

  it("skips direction policies and container-separated interactions", () => {
    const value = input();
    value.settings.linkPolicies = new Map([["parts", {
      mode: "direction", direction: "right", xSpacing: 100, ySpacing: 100
    }]]);
    value.containers = {
      containers: [{
        id: "only-A", kind: "parent", originNodeId: "A", memberNodeIds: ["A"],
        bounds: { left: -10, top: -10, right: 10, bottom: 10 },
        parentContainerIds: []
      }]
    };

    const result = new GraphForceAccumulator().accumulate(value, {
      nodesMayInteract: () => true
    });
    expect(result.diagnostics.skippedDirectionEdgeIds).toEqual(["A-B"]);

    const isolated = new GraphForceAccumulator().accumulate(value);
    expect(isolated.velocityDeltas.get("A")).toEqual({ x: 0, y: 0 });
    expect(isolated.diagnostics).toMatchObject({
      skippedSeparatedNodePairCount: 1,
      skippedSeparatedEdgeIds: ["A-B"]
    });
  });

  it("blocks legacy transient exclusions but lets position locks accumulate", () => {
    const value = input();
    value.constraints.transientNodeConstraints = [
      { kind: "drag-target", nodeId: "A", position: { x: 0, y: 0 } },
      { kind: "position-lock", nodeId: "B", reason: "focal", position: { x: 140, y: 0 } }
    ];

    const result = new GraphForceAccumulator().accumulate(value);

    expect(result.velocityDeltas.get("A")).toEqual({ x: 0, y: 0 });
    expect(result.velocityDeltas.get("B")?.x).toBeCloseTo(7.8);
    expect(result.diagnostics.blockedVelocityApplicationCount).toBe(4);
  });

  it("returns zero deltas while the simulation is frozen", () => {
    const value = input();
    value.constraints.simulationFrozen = true;

    const result = new GraphForceAccumulator().accumulate(value);

    expect(Array.from(result.velocityDeltas.values())).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    ]);
    expect(result.diagnostics.simulationFrozen).toBe(true);
  });

  it("allows callers to further restrict force recipients", () => {
    const result = new GraphForceAccumulator().accumulate(input(), {
      canReceiveForce: (nodeId) => nodeId !== "B"
    });

    expect(result.velocityDeltas.get("A")?.x).toBeCloseTo(-7.8);
    expect(result.velocityDeltas.get("B")).toEqual({ x: 0, y: 0 });
  });

  it("adds world and embedded gravity to eligible nodes", () => {
    const value = input();
    value.settings.centerStrength = 0.1;
    value.graph.nodes[0]!.position = { x: 10, y: 20 };
    value.graph.nodes[1]!.contextId = "embedded:lens";
    value.graph.nodes[1]!.position = { x: 40, y: 50 };
    value.containers = {
      containers: [{
        id: "lens", kind: "embedded", originNodeId: "A", memberNodeIds: ["B"],
        bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        parentContainerIds: [], gravityStrength: 0.2
      }]
    };

    const result = new GraphForceAccumulator().accumulate(value, {
      nodesMayInteract: () => false
    });

    expect(result.velocityDeltas.get("A")).toEqual({ x: -1, y: -2 });
    expect(result.velocityDeltas.get("B")?.x).toBeCloseTo(1.95);
    expect(result.velocityDeltas.get("B")?.y).toBe(0);
    expect(result.diagnostics).toMatchObject({
      worldGravityApplicationCount: 1,
      embeddedGravityApplicationCount: 1
    });
  });

  it("does not center persistent pins or transiently constrained nodes", () => {
    const value = input();
    value.settings.repulsionStrength = 0;
    value.settings.centerStrength = 0.1;
    value.graph.edges = [];
    value.constraints.persistentPins = [{
      nodeId: "A", position: { x: 0, y: 0 }
    }];
    value.constraints.transientNodeConstraints = [{
      kind: "position-lock",
      nodeId: "B",
      reason: "focal",
      position: { x: 140, y: 0 }
    }];

    const result = new GraphForceAccumulator().accumulate(value, {
      nodesMayInteract: () => false
    });

    expect(Array.from(result.velocityDeltas.values())).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    ]);
    expect(result.diagnostics).toMatchObject({
      blockedVelocityApplicationCount: 2,
      worldGravityApplicationCount: 0,
      embeddedGravityApplicationCount: 0
    });
  });

  it("adds node-container force and an eligible origin reaction", () => {
    const value = input();
    value.containers = { containers: [{
      id: "parent", kind: "parent", originNodeId: "A", memberNodeIds: [],
      bounds: { left: -40, top: -40, right: 40, bottom: 40 },
      parentContainerIds: []
    }] };

    const result = new GraphForceAccumulator().accumulate(value);

    expect(result.velocityDeltas.get("A")?.x).toBeCloseTo(-15.8);
    expect(result.velocityDeltas.get("B")?.x).toBeCloseTo(15.8);
    expect(result.diagnostics).toMatchObject({
      activeNodeContainerForceCount: 1,
      originReactionCount: 1
    });
  });

  it("skips container members and blocks reactions on lens owners", () => {
    const member = input();
    member.containers = { containers: [{
      id: "parent", kind: "parent", originNodeId: "A", memberNodeIds: ["B"],
      bounds: { left: -40, top: -40, right: 40, bottom: 40 },
      parentContainerIds: []
    }] };
    expect(new GraphForceAccumulator().accumulate(member).diagnostics)
      .toMatchObject({ activeNodeContainerForceCount: 0, originReactionCount: 0 });

    const lensOwner = input();
    lensOwner.containers = { containers: [{
      id: "parent", kind: "parent", originNodeId: "A", memberNodeIds: [],
      bounds: { left: -40, top: -40, right: 40, bottom: 40 },
      parentContainerIds: []
    }] };
    lensOwner.constraints.transientNodeConstraints = [{
      kind: "velocity-freeze", nodeId: "A", reason: "lens-owner"
    }];
    const result = new GraphForceAccumulator().accumulate(lensOwner);
    expect(result.velocityDeltas.get("A")).toEqual({ x: 0, y: 0 });
    expect(result.velocityDeltas.get("B")?.x).toBeCloseTo(15.8);
    expect(result.diagnostics).toMatchObject({
      activeNodeContainerForceCount: 1,
      originReactionCount: 0
    });
  });

  it("excludes locked external nodes from container force", () => {
    const value = input();
    value.containers = { containers: [{
      id: "parent", kind: "parent", originNodeId: "A", memberNodeIds: [],
      bounds: { left: -40, top: -40, right: 40, bottom: 40 },
      parentContainerIds: []
    }] };
    value.constraints.transientNodeConstraints = [{
      kind: "position-lock", nodeId: "B", reason: "focal",
      position: { x: 140, y: 0 }
    }];

    const result = new GraphForceAccumulator().accumulate(value);
    expect(result.velocityDeltas.get("A")?.x).toBeCloseTo(-7.8);
    expect(result.velocityDeltas.get("B")?.x).toBeCloseTo(7.8);
    expect(result.diagnostics.activeNodeContainerForceCount).toBe(0);
  });
});
