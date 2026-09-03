import { describe, expect, it } from "vitest";
import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphPhysicsInputProjector } from "./GraphPhysicsInputProjector";

const nodeA = "A" as NodeInstanceId;
const nodeB = "B" as NodeInstanceId;

function snapshot(): GraphSnapshot {
  return {
    notes: [{
      id: "shared.md",
      path: "shared.md",
      name: "Shared",
      availability: "available",
      properties: { secretFromPhysics: true }
    }],
    nodes: [
      node(nodeA, "graph:root", 10),
      node(nodeB, "lens:one", 20)
    ],
    edges: [
      {
        id: "edge:connected",
        fromNodeId: nodeA,
        toNodeId: nodeB,
        linkTypeId: "parts",
        contextId: "graph:root",
        origin: "discovered"
      },
      {
        id: "edge:dangling",
        fromNodeId: nodeA,
        toNodeId: "missing",
        linkTypeId: "parts",
        contextId: "graph:root",
        origin: "discovered"
      },
      {
        id: "edge:overlay",
        fromNodeId: nodeA,
        toNodeId: nodeB,
        linkTypeId: "parts",
        contextId: "graph:root",
        origin: "overlay"
      }
    ],
    badges: [{
      id: "A::parts",
      nodeId: nodeA,
      linkTypeId: "parts",
      contextId: "graph:root",
      label: "Parts",
      color: "#fff",
      state: "collapsed",
      semantic: "link",
      hasRelationships: true,
      duplicateNodes: false
    }],
    expansions: [],
    lenses: []
  };
}

function node(
  id: NodeInstanceId,
  contextId: string,
  coordinate: number
): GraphSnapshot["nodes"][number] {
  return {
    id,
    noteId: "shared.md",
    contextId,
    position: { x: coordinate, y: coordinate + 1 },
    velocity: { x: coordinate + 2, y: coordinate + 3 },
    radius: coordinate + 4,
    pinned: id === nodeB,
    selected: true,
    origin: { kind: "root" }
  };
}

describe("GraphPhysicsInputProjector", () => {
  it("projects only physics-facing node and edge fields", () => {
    const result = new GraphPhysicsInputProjector().project(snapshot(), 7, 42);

    expect(result.input).toEqual({
      structuralRevision: 7,
      frameSequence: 42,
      nodes: [
        {
          id: nodeA,
          contextId: "graph:root",
          position: { x: 10, y: 11 },
          velocity: { x: 12, y: 13 },
          radius: 14,
          pinned: false
        },
        {
          id: nodeB,
          contextId: "lens:one",
          position: { x: 20, y: 21 },
          velocity: { x: 22, y: 23 },
          radius: 24,
          pinned: true
        }
      ],
      edges: [{
        id: "edge:connected",
        fromNodeId: nodeA,
        toNodeId: nodeB,
        linkTypeId: "parts",
        contextId: "graph:root"
      }]
    });
    expect(result.diagnostics.ignoredEdgeIds).toEqual([
      "edge:dangling",
      "edge:overlay"
    ]);
    expect(result.input.nodes[0]).not.toHaveProperty("noteId");
    expect(result.input.nodes[0]).not.toHaveProperty("selected");
    expect(result.input).not.toHaveProperty("notes");
    expect(result.input).not.toHaveProperty("badges");
  });

  it("preserves separate node instances even when they visualize one note", () => {
    const result = new GraphPhysicsInputProjector().project(snapshot(), 0, 0);
    expect(result.input.nodes.map((item) => item.id)).toEqual([nodeA, nodeB]);
  });

  it("returns detached coordinate objects", () => {
    const source = snapshot();
    const result = new GraphPhysicsInputProjector().project(source, 0, 0);
    (result.input.nodes[0]!.position as { x: number }).x = 500;
    (result.input.nodes[0]!.velocity as { x: number }).x = 500;

    expect(source.nodes[0]?.position.x).toBe(10);
    expect(source.nodes[0]?.velocity.x).toBe(12);
  });
});
