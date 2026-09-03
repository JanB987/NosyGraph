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
    expect(result.diagnostics.blockedVelocityApplicationCount).toBe(2);
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
});
