import { describe, expect, it } from "vitest";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphQueries } from "./GraphQueries";

const ROOT_CONTEXT = "graph:root";
const LENS_CONTEXT = "lens:project";

function node(
  id: string,
  noteId: string,
  options: Partial<GraphNodeInstance> = {}
): GraphNodeInstance {
  return {
    id,
    noteId,
    contextId: ROOT_CONTEXT,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    radius: 20,
    pinned: false,
    selected: false,
    origin: { kind: "root" },
    ...options
  };
}

function createSnapshot(): GraphSnapshot {
  return {
    notes: [
      { id: "A.md", path: "A.md", name: "A", properties: {} },
      { id: "B.md", path: "B.md", name: "B", properties: {} },
      { id: "C.md", path: "C.md", name: "C", properties: {} }
    ],
    nodes: [
      node("A.md", "A.md", { selected: true }),
      node("A.md::parts::B.md", "B.md", {
        origin: {
          kind: "badge-expansion",
          expansionId: "A.md::parts",
          sourceNodeId: "A.md"
        }
      }),
      node("lens-1::B.md", "B.md", {
        contextId: LENS_CONTEXT,
        origin: {
          kind: "embedded-graph",
          lensId: "lens-1",
          sourceNodeId: "A.md"
        }
      }),
      node("C.md", "C.md", {
        contextId: LENS_CONTEXT,
        pinned: true
      })
    ],
    expansions: [
      {
        id: "A.md::parts",
        sourceNodeId: "A.md",
        sourceNoteId: "A.md",
        linkTypeId: "parts",
        contextId: ROOT_CONTEXT,
        createdNodeIds: ["A.md::parts::B.md"],
        createdEdgeIds: [],
        childExpansionIds: []
      }
    ]
  };
}

function queries(snapshot = createSnapshot()): GraphQueries {
  return new GraphQueries({ getSnapshot: () => snapshot });
}

describe("GraphQueries", () => {
  it("distinguishes node instances from unique notes", () => {
    const graph = queries();

    expect(graph.getAllNodeInstances().map((item) => item.id)).toEqual([
      "A.md",
      "A.md::parts::B.md",
      "lens-1::B.md",
      "C.md"
    ]);
    expect(graph.getUniqueVisibleNotes().map((note) => note.id)).toEqual([
      "A.md",
      "B.md",
      "C.md"
    ]);
    expect(graph.getNodeInstancesForNote("B.md").map((item) => item.id)).toEqual([
      "A.md::parts::B.md",
      "lens-1::B.md"
    ]);
  });

  it("filters contexts, roots, and selection without changing the snapshot", () => {
    const snapshot = createSnapshot();
    const graph = queries(snapshot);

    expect(graph.getVisibleNodeInstances(LENS_CONTEXT).map((item) => item.id)).toEqual([
      "lens-1::B.md",
      "C.md"
    ]);
    expect(graph.getUniqueVisibleNotes(LENS_CONTEXT).map((note) => note.id)).toEqual([
      "B.md",
      "C.md"
    ]);
    expect(graph.getSelectedNodes().map((item) => item.id)).toEqual(["A.md"]);
    expect(graph.getRootNodes().map((item) => item.id)).toEqual(["A.md", "C.md"]);

    const returned = graph.getAllNodeInstances() as GraphNodeInstance[];
    returned.pop();
    expect(snapshot.nodes).toHaveLength(4);
  });

  it("resolves nodes owned by an expansion or badge", () => {
    const graph = queries();

    expect(graph.getExpansion("A.md::parts")?.sourceNoteId).toBe("A.md");
    expect(graph.getNodesForExpansion("A.md::parts").map((item) => item.noteId)).toEqual(["B.md"]);
    expect(graph.getNodesForBadge("A.md", "parts").map((item) => item.noteId)).toEqual(["B.md"]);
    expect(graph.getNodesForBadge("A.md", "unknown")).toEqual([]);
    expect(graph.getNodesForExpansion("missing")).toEqual([]);
  });
});

