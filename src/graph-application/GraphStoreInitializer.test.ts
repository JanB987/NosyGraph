import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphStoreInitializer } from "./GraphStoreInitializer";

function validSnapshot(): GraphSnapshot {
  return {
    notes: [
      {
        id: "A.md",
        path: "A.md",
        name: "A",
        availability: "available",
        properties: { nested: { value: 1 } }
      },
      {
        id: "B.md",
        path: "B.md",
        name: "B",
        availability: "available",
        properties: {}
      }
    ],
    nodes: [
      {
        id: "root:A",
        noteId: "A.md",
        contextId: "graph:root",
        position: { x: 1, y: 2 },
        velocity: { x: 0, y: 0 },
        radius: 20,
        pinned: false,
        selected: true,
        origin: { kind: "root" }
      },
      {
        id: "exp:A::parts::B",
        noteId: "B.md",
        contextId: "graph:root",
        position: { x: 30, y: 40 },
        velocity: { x: 0, y: 0 },
        radius: 18,
        pinned: false,
        selected: false,
        origin: {
          kind: "badge-expansion",
          expansionId: "root:A::parts",
          sourceNodeId: "root:A"
        }
      }
    ],
    edges: [
      {
        id: "edge::root:A::B::parts::parts",
        fromNodeId: "root:A",
        toNodeId: "exp:A::parts::B",
        linkTypeId: "parts",
        contextId: "graph:root",
        origin: "badge-expansion"
      }
    ],
    badges: [
      {
        id: "root:A::parts",
        nodeId: "root:A",
        linkTypeId: "parts",
        contextId: "graph:root",
        label: "Parts",
        color: "#4488cc",
        state: "expanded",
        semantic: "link",
        hasRelationships: true,
        duplicateNodes: false,
        expansionId: "root:A::parts"
      }
    ],
    expansions: [
      {
        id: "root:A::parts",
        sourceNodeId: "root:A",
        sourceNoteId: "A.md",
        linkTypeId: "parts",
        contextId: "graph:root",
        ownedNodeIds: ["exp:A::parts::B"],
        ownedEdgeIds: ["edge::root:A::B::parts::parts"],
        childExpansionIds: []
      }
    ],
    lenses: [
      {
        id: "lens:A",
        sourceNodeId: "root:A",
        documentId: "Embedded.md",
        contextId: "embedded:lens-A",
        bounds: { left: 0, top: 0, right: 200, bottom: 140 },
        viewport: { x: 0, y: 0, zoom: 1 },
        locked: false,
        maximized: false
      }
    ]
  };
}

function source(snapshot: GraphSnapshot) {
  return { getSnapshot: () => snapshot };
}

describe("GraphStoreInitializer", () => {
  it("builds a detached store while preserving stable identities", () => {
    const initial = validSnapshot();
    const sourceState = { current: initial };
    const result = new GraphStoreInitializer({
      getSnapshot: () => sourceState.current
    }).initialize();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.notes.map((item) => item.id)).toEqual(["A.md", "B.md"]);
    expect(result.snapshot.nodes.map((item) => item.id)).toEqual([
      "root:A",
      "exp:A::parts::B"
    ]);
    expect(result.snapshot.edges[0]?.id).toBe("edge::root:A::B::parts::parts");
    expect(result.snapshot.badges[0]?.id).toBe("root:A::parts");
    expect(result.snapshot.expansions[0]?.id).toBe("root:A::parts");
    expect(result.snapshot.lenses[0]?.id).toBe("lens:A");
    expect(result.store.getSelectedNodeIds()).toEqual(["root:A"]);

    const changedSource: GraphSnapshot = {
      ...initial,
      notes: initial.notes.map((note, index) => index === 0
        ? { ...note, properties: { nested: { value: 99 } } }
        : note),
      nodes: initial.nodes.map((node, index) => index === 0
        ? { ...node, position: { ...node.position, x: 800 } }
        : node)
    };
    sourceState.current = changedSource;
    expect(changedSource.notes[0]?.properties.nested).toEqual({ value: 99 });

    expect(result.store.getSnapshot().notes[0]?.properties).toEqual({
      nested: { value: 1 }
    });
    expect(result.store.getSnapshot().nodes[0]?.position.x).toBe(1);
  });

  it("rejects duplicate identities before constructing the store", () => {
    const initial = validSnapshot();
    initial.nodes = [initial.nodes[0]!, { ...initial.nodes[1]!, id: initial.nodes[0]!.id }];

    const result = new GraphStoreInitializer(source(initial)).initialize();

    expect(result).toEqual({
      ok: false,
      reason: "invalid-snapshot",
      failure: {
        applied: false,
        reason: "duplicate-id",
        collection: "nodes",
        entityId: "root:A"
      }
    });
  });

  it("rejects blank identities before reference validation", () => {
    const initial = validSnapshot();
    initial.badges = [{ ...initial.badges[0]!, id: "  " }];

    const result = new GraphStoreInitializer(source(initial)).initialize();

    expect(result).toEqual({
      ok: false,
      reason: "invalid-snapshot",
      failure: {
        applied: false,
        reason: "invalid-id",
        collection: "badges",
        entityId: "  "
      }
    });
  });

  it("rejects references to entities missing from the initial snapshot", () => {
    const initial = validSnapshot();
    initial.edges = [{
      ...initial.edges[0]!,
      toNodeId: "missing-node"
    }];

    const result = new GraphStoreInitializer(source(initial)).initialize();

    expect(result).toEqual({
      ok: false,
      reason: "invalid-snapshot",
      failure: {
        applied: false,
        reason: "missing-reference",
        collection: "edges",
        entityId: "edge::root:A::B::parts::parts",
        referenceId: "missing-node"
      }
    });
  });

  it("rejects cyclic expansion ownership before store mode can mount", () => {
    const initial = validSnapshot();
    initial.expansions = [{
      ...initial.expansions[0]!,
      childExpansionIds: ["root:A::parts"]
    }];

    const result = new GraphStoreInitializer(source(initial)).initialize();

    expect(result).toEqual({
      ok: false,
      reason: "invalid-snapshot",
      failure: {
        applied: false,
        reason: "expansion-cycle",
        collection: "expansions",
        entityId: "root:A::parts"
      }
    });
  });
});
