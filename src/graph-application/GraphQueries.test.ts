import { describe, expect, it } from "vitest";
import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphEdge } from "../graph-domain/GraphEdge";
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
    edges: [
      {
        id: "A.md::B.md::parts",
        fromNodeId: "A.md",
        toNodeId: "A.md::parts::B.md",
        linkTypeId: "parts",
        contextId: ROOT_CONTEXT,
        origin: "discovered"
      },
      {
        id: "lens-1::B.md::C.md::related",
        fromNodeId: "lens-1::B.md",
        toNodeId: "C.md",
        linkTypeId: "related",
        contextId: LENS_CONTEXT,
        origin: "visible"
      }
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
    badges: [
      {
        id: "A.md::parts",
        nodeId: "A.md",
        linkTypeId: "parts",
        contextId: ROOT_CONTEXT,
        label: "Parts",
        color: "#4488cc",
        state: "expanded",
        semantic: "link",
        hasRelationships: true,
        duplicateNodes: false,
        expansionId: "A.md::parts"
      },
      {
        id: "A.md::parents",
        nodeId: "A.md",
        linkTypeId: "parents",
        contextId: ROOT_CONTEXT,
        label: "Parents",
        color: "#cc8844",
        state: "collapsed",
        semantic: "parent",
        hasRelationships: true,
        duplicateNodes: false
      },
      {
        id: "lens-1::B.md::related",
        nodeId: "lens-1::B.md",
        linkTypeId: "related",
        contextId: LENS_CONTEXT,
        label: "Related",
        color: "#6e96dc",
        state: "collapsed",
        semantic: "link",
        hasRelationships: false,
        duplicateNodes: true
      }
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
    ],
    lenses: [
      {
        id: "lens-1",
        sourceNodeId: "A.md",
        documentId: "Project Graph.md",
        contextId: LENS_CONTEXT,
        bounds: { left: 0, top: 0, right: 400, bottom: 300 },
        viewport: { x: 10, y: 20, zoom: 0.8 },
        locked: false,
        maximized: false
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

  it("queries edges by endpoint and resolves nodes in a lens context", () => {
    const snapshot = createSnapshot();
    const graph = queries(snapshot);

    expect(graph.getEdges()).toHaveLength(2);
    expect(graph.getEdgesForNode("A.md").map((edge) => edge.linkTypeId)).toEqual(["parts"]);
    expect(graph.getEdgesForNode("C.md").map((edge) => edge.linkTypeId)).toEqual(["related"]);
    expect(graph.getLens("lens-1")?.documentId).toBe("Project Graph.md");
    expect(graph.getLensNodes("lens-1").map((item) => item.id)).toEqual([
      "lens-1::B.md",
      "C.md"
    ]);
    expect(graph.getLensNodes("missing")).toEqual([]);

    const edges = graph.getEdges() as GraphEdge[];
    edges.pop();
    expect(snapshot.edges).toHaveLength(2);
  });

  it("queries normal, parent, duplicate, collapsed, and expanded badges", () => {
    const snapshot = createSnapshot();
    const graph = queries(snapshot);

    expect(graph.getBadges()).toHaveLength(3);
    expect(graph.getBadge("A.md::parts")).toMatchObject({
      state: "expanded",
      semantic: "link",
      hasRelationships: true,
      duplicateNodes: false,
      expansionId: "A.md::parts"
    });
    expect(graph.getBadge("A.md::parents")).toMatchObject({
      state: "collapsed",
      semantic: "parent"
    });
    expect(graph.getBadgesForNode("lens-1::B.md")).toEqual([
      expect.objectContaining({ duplicateNodes: true, hasRelationships: false })
    ]);
    expect(graph.getBadgesForNode("missing")).toEqual([]);

    const badges = graph.getBadges() as GraphBadge[];
    badges.pop();
    expect(snapshot.badges).toHaveLength(3);
  });
});
