import { describe, expect, it } from "vitest";
import type { GraphRenderSnapshot } from "./GraphRenderer";
import { GraphRenderer } from "./GraphRenderer";

function snapshot(): GraphRenderSnapshot {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    notes: [{
      id: "A.md",
      path: "A.md",
      name: "Alpha",
      availability: "available",
      properties: {}
    }],
    nodes: [{
      id: "node:A",
      noteId: "A.md",
      contextId: "graph:root",
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      radius: 20,
      pinned: false,
      selected: true,
      origin: { kind: "root" }
    }],
    edges: [],
    badges: [{
      id: "node:A::parts",
      nodeId: "node:A",
      linkTypeId: "parts",
      contextId: "graph:root",
      label: "Parts",
      color: "#4488cc",
      state: "collapsed",
      semantic: "link",
      hasRelationships: true,
      duplicateNodes: false
    }],
    expansions: [],
    lenses: []
  };
}

describe("GraphRenderer", () => {
  it("renders detached snapshots into stable node and badge hit regions", () => {
    const renderer = new GraphRenderer();

    renderer.render(snapshot());

    expect(renderer.getRenderedNodeIds()).toEqual(["node:A"]);
    expect(renderer.getRenderedBadgeIds()).toEqual(["node:A::parts"]);
    expect(renderer.hitTestNode({ x: 100, y: 100 })).toBe("node:A");
    expect(renderer.hitTestNode({ x: 130, y: 100 })).toBeUndefined();
    expect(renderer.hitTestBadge({ x: 80, y: 65 })).toBe("node:A::parts");
    expect(renderer.hitTestBadge({ x: 20, y: 20 })).toBeUndefined();
  });

  it("keeps rendered handles detached from later source snapshots", () => {
    const renderer = new GraphRenderer();
    const initial = snapshot();

    renderer.render(initial);
    const changed: GraphRenderSnapshot = {
      ...initial,
      nodes: initial.nodes.map((node) => ({
        ...node,
        position: { x: 300, y: 300 }
      }))
    };

    expect(renderer.hitTestNode({ x: 100, y: 100 })).toBe("node:A");
    renderer.render(changed);
    expect(renderer.hitTestNode({ x: 100, y: 100 })).toBeUndefined();
    expect(renderer.hitTestNode({ x: 300, y: 300 })).toBe("node:A");
  });

  it("normalizes invalid viewport and radius values without changing semantic state", () => {
    const renderer = new GraphRenderer();
    const initial = snapshot();
    const invalid: GraphRenderSnapshot = {
      ...initial,
      viewport: { x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: 0 },
      nodes: initial.nodes.map((node) => ({ ...node, radius: Number.NaN }))
    };

    renderer.render(invalid);

    expect(renderer.hitTestNode({ x: 100, y: 100 })).toBe("node:A");
    expect(renderer.getRenderedNodeIds()).toEqual(["node:A"]);
  });
});
