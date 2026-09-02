import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphPhysicsRuntimeInputComposer } from "./GraphPhysicsRuntimeInputComposer";

function snapshot(): GraphSnapshot {
  return {
    notes: [],
    nodes: [{
      id: "A", noteId: "A.md", contextId: "graph:root",
      position: { x: 10, y: 20 }, velocity: { x: 1, y: 2 },
      radius: 15, pinned: true, selected: false, origin: { kind: "root" }
    }],
    edges: [{
      id: "dangling", fromNodeId: "A", toNodeId: "missing",
      linkTypeId: "parts", contextId: "graph:root", origin: "discovered"
    }],
    badges: [], expansions: [], lenses: []
  };
}

describe("GraphPhysicsRuntimeInputComposer", () => {
  it("composes one versioned input from every physics boundary", () => {
    const result = new GraphPhysicsRuntimeInputComposer().compose({
      snapshot: snapshot(),
      structuralRevision: 7,
      frameSequence: 42,
      settings: { repulsionStrength: 2000 },
      transientConstraints: {
        simulationFrozen: true,
        nodeConstraints: [{
          kind: "direction-target", nodeId: "A", position: { x: 120, y: 0 }
        }]
      },
      containers: {
        containers: [{
          id: "parent", kind: "parent", originNodeId: "A",
          memberNodeIds: ["A"],
          bounds: { left: 0, top: 0, right: 200, bottom: 200 },
          parentContainerIds: []
        }]
      }
    });

    expect(result.input.graph).toMatchObject({
      structuralRevision: 7, frameSequence: 42,
      nodes: [{ id: "A", radius: 15, pinned: true }], edges: []
    });
    expect(result.input.settings.repulsionStrength).toBe(2000);
    expect(result.input.constraints).toMatchObject({
      simulationFrozen: true,
      persistentPins: [{ nodeId: "A", position: { x: 10, y: 20 } }],
      transientNodeConstraints: [{ kind: "direction-target", nodeId: "A" }]
    });
    expect(result.input.containers.containers).toHaveLength(1);
    expect(result.diagnostics.graph.ignoredEdgeIds).toEqual(["dangling"]);
  });

  it("aggregates constraint and container diagnostics", () => {
    const result = new GraphPhysicsRuntimeInputComposer().compose({
      snapshot: snapshot(), structuralRevision: 0, frameSequence: 0,
      transientConstraints: {
        simulationFrozen: false,
        nodeConstraints: [{
          kind: "velocity-freeze", nodeId: "missing", reason: "alt-drag"
        }]
      },
      containers: {
        containers: [{
          id: "bad", kind: "parent", originNodeId: "missing",
          memberNodeIds: [], bounds: { left: 0, top: 0, right: 1, bottom: 1 },
          parentContainerIds: []
        }]
      }
    });

    expect(result.diagnostics.constraints.ignoredTransientConstraints).toHaveLength(1);
    expect(result.diagnostics.containers.rejectedContainers).toEqual([
      { containerId: "bad", reason: "missing-origin" }
    ]);
  });
});
