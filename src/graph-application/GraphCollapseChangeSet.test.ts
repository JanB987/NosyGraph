import { describe, expect, it } from "vitest";
import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphEdge } from "../graph-domain/GraphEdge";
import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import {
  createGraphCollapseChangeSet,
  type GraphBadgeCollapsePlan
} from "./GraphCollapseChangeSet";
import { GraphStore } from "./GraphStore";

const plan: GraphBadgeCollapsePlan = {
  kind: "collapse",
  badgeId: "A::parts",
  expansionId: "A::parts",
  sourceNodeId: "A",
  sourceNoteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root"
};

function note(id: string): GraphNote {
  return {
    id,
    path: id,
    name: id.replace(/\.md$/, ""),
    availability: "available",
    properties: {}
  };
}

function rootNode(id: string): GraphNodeInstance {
  return {
    id,
    noteId: `${id}.md`,
    contextId: "graph:root",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    radius: 20,
    pinned: false,
    selected: false,
    origin: { kind: "root" }
  };
}

function expansionNode(
  id: string,
  expansionId: string,
  sourceNodeId: string
): GraphNodeInstance {
  return {
    ...rootNode(id),
    origin: { kind: "badge-expansion", expansionId, sourceNodeId }
  };
}

function badge(
  nodeId: string,
  state: "collapsed" | "expanded" = "collapsed"
): GraphBadge {
  const id = `${nodeId}::parts`;
  return {
    id,
    nodeId,
    linkTypeId: "parts",
    contextId: "graph:root",
    label: "Parts",
    color: "#4488cc",
    state,
    semantic: "link",
    hasRelationships: true,
    duplicateNodes: false,
    ...(state === "expanded" ? { expansionId: id } : {})
  };
}

function edge(from: string, to: string, origin: GraphEdge["origin"] = "badge-expansion"): GraphEdge {
  return {
    id: `edge::${from}::${to}::parts::parts`,
    fromNodeId: from,
    toNodeId: to,
    linkTypeId: "parts",
    contextId: "graph:root",
    origin
  };
}

function expansion(
  id: string,
  sourceNodeId: string,
  ownedNodeIds: readonly string[],
  ownedEdgeIds: readonly string[],
  childExpansionIds: readonly string[] = []
): GraphExpansion {
  return {
    id,
    sourceNodeId,
    sourceNoteId: `${sourceNodeId}.md`,
    linkTypeId: "parts",
    contextId: "graph:root",
    ownedNodeIds,
    ownedEdgeIds,
    childExpansionIds
  };
}

function simpleSnapshot(): GraphSnapshot {
  const ab = edge("A", "B");
  return {
    notes: [note("A.md"), note("B.md")],
    nodes: [rootNode("A"), expansionNode("B", plan.expansionId, "A")],
    edges: [ab],
    badges: [badge("A", "expanded"), badge("B")],
    expansions: [expansion(plan.expansionId, "A", ["B"], [ab.id])],
    lenses: []
  };
}

describe("createGraphCollapseChangeSet", () => {
  it("removes an expansion's exclusively owned entities atomically", () => {
    const snapshot = simpleSnapshot();
    const result = createGraphCollapseChangeSet(plan, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet).toMatchObject({
      cause: {
        kind: "badge-collapse",
        badgeId: plan.badgeId,
        expansionId: plan.expansionId
      },
      notes: { upsert: [], removeIds: ["B.md"] },
      nodes: { upsert: [], removeIds: ["B"] },
      edges: { upsert: [], removeIds: [snapshot.edges[0]!.id] },
      expansions: { upsert: [], removeIds: [plan.expansionId] }
    });
    expect(result.changeSet.badges).toEqual({
      upsert: [badge("A", "collapsed")],
      removeIds: [badge("B").id]
    });

    const store = new GraphStore(snapshot);
    expect(store.applyChangeSet(result.changeSet).applied).toBe(true);
    expect(store.getSnapshot()).toEqual({
      notes: [note("A.md")],
      nodes: [rootNode("A")],
      edges: [],
      badges: [badge("A")],
      expansions: [],
      lenses: []
    });
  });

  it("collapses descendants and removes their badges", () => {
    const ab = edge("A", "B");
    const bc = edge("B", "C");
    const childId = "B::parts";
    const snapshot: GraphSnapshot = {
      notes: [note("A.md"), note("B.md"), note("C.md")],
      nodes: [
        rootNode("A"),
        expansionNode("B", plan.expansionId, "A"),
        expansionNode("C", childId, "B")
      ],
      edges: [ab, bc],
      badges: [badge("A", "expanded"), badge("B", "expanded"), badge("C")],
      expansions: [
        expansion(plan.expansionId, "A", ["B"], [ab.id], [childId]),
        expansion(childId, "B", ["C"], [bc.id])
      ],
      lenses: []
    };
    const result = createGraphCollapseChangeSet(plan, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.nodes.removeIds).toEqual(["B", "C"]);
    expect(result.changeSet.edges.removeIds).toEqual([ab.id, bc.id]);
    expect(result.changeSet.expansions.removeIds).toEqual([plan.expansionId, childId]);
    expect(result.changeSet.badges.removeIds).toEqual([badge("B").id, badge("C").id]);
  });

  it("updates a surviving parent when only its child is collapsed", () => {
    const rootId = "Root::parts";
    const rootToA = edge("Root", "A");
    const ab = edge("A", "B");
    const parent = expansion(rootId, "Root", ["A"], [rootToA.id], [plan.expansionId]);
    const snapshot: GraphSnapshot = {
      notes: [note("Root.md"), note("A.md"), note("B.md")],
      nodes: [
        rootNode("Root"),
        expansionNode("A", rootId, "Root"),
        expansionNode("B", plan.expansionId, "A")
      ],
      edges: [rootToA, ab],
      badges: [badge("A", "expanded")],
      expansions: [parent, expansion(plan.expansionId, "A", ["B"], [ab.id])],
      lenses: []
    };
    const result = createGraphCollapseChangeSet(plan, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.expansions.upsert).toEqual([{
      ...parent,
      childExpansionIds: []
    }]);
    expect(result.changeSet.expansions.removeIds).toEqual([plan.expansionId]);
    expect(new GraphStore(snapshot).applyChangeSet(result.changeSet).applied).toBe(true);
  });

  it("rehomes a node that another expansion still owns", () => {
    const ab = edge("A", "B");
    const xb = edge("X", "B");
    const other = expansion("X::parts", "X", ["B"], [xb.id]);
    const snapshot: GraphSnapshot = {
      notes: [note("A.md"), note("B.md"), note("X.md")],
      nodes: [
        rootNode("A"),
        expansionNode("B", plan.expansionId, "A"),
        rootNode("X")
      ],
      edges: [ab, xb],
      badges: [badge("A", "expanded")],
      expansions: [
        expansion(plan.expansionId, "A", ["B"], [ab.id]),
        other
      ],
      lenses: []
    };
    const result = createGraphCollapseChangeSet(plan, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.nodes).toEqual({
      upsert: [{
        ...snapshot.nodes[1],
        origin: {
          kind: "badge-expansion",
          expansionId: other.id,
          sourceNodeId: other.sourceNodeId
        }
      }],
      removeIds: []
    });
    expect(result.changeSet.edges.removeIds).toEqual([ab.id]);
    expect(result.changeSet.notes.removeIds).toEqual([]);
    expect(new GraphStore(snapshot).applyChangeSet(result.changeSet).applied).toBe(true);
  });

  it("preserves independently rooted nodes and discovered edges", () => {
    const ab = edge("A", "B", "discovered");
    const snapshot: GraphSnapshot = {
      ...simpleSnapshot(),
      nodes: [rootNode("A"), rootNode("B")],
      edges: [ab],
      expansions: [expansion(plan.expansionId, "A", ["B"], [ab.id])],
      badges: [badge("A", "expanded")]
    };
    const result = createGraphCollapseChangeSet(plan, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.nodes).toEqual({ upsert: [], removeIds: [] });
    expect(result.changeSet.edges).toEqual({ upsert: [], removeIds: [] });
    expect(result.changeSet.notes.removeIds).toEqual([]);
    expect(new GraphStore(snapshot).applyChangeSet(result.changeSet).applied).toBe(true);
  });

  it("rejects stale state and inconsistent ownership", () => {
    expect(createGraphCollapseChangeSet(plan, {
      ...simpleSnapshot(),
      badges: []
    })).toEqual({ ok: false, reason: "badge-not-found" });
    expect(createGraphCollapseChangeSet(plan, {
      ...simpleSnapshot(),
      badges: [badge("A")]
    })).toEqual({
      ok: false,
      reason: "badge-outdated",
      entityId: plan.badgeId
    });
    expect(createGraphCollapseChangeSet(plan, {
      ...simpleSnapshot(),
      expansions: []
    })).toEqual({ ok: false, reason: "expansion-not-found" });

    const missingChild = simpleSnapshot();
    missingChild.expansions = [{
      ...missingChild.expansions[0]!,
      childExpansionIds: ["missing-child"]
    }];
    expect(createGraphCollapseChangeSet(plan, missingChild)).toEqual({
      ok: false,
      reason: "expansion-tree-outdated",
      entityId: "missing-child"
    });

    const cycle = simpleSnapshot();
    cycle.expansions = [{
      ...cycle.expansions[0]!,
      childExpansionIds: [plan.expansionId]
    }];
    expect(createGraphCollapseChangeSet(plan, cycle)).toEqual({
      ok: false,
      reason: "expansion-tree-outdated",
      entityId: plan.expansionId
    });

    const missingOwnedNode = simpleSnapshot();
    missingOwnedNode.expansions = [{
      ...missingOwnedNode.expansions[0]!,
      ownedNodeIds: ["missing-node"]
    }];
    expect(createGraphCollapseChangeSet(plan, missingOwnedNode)).toEqual({
      ok: false,
      reason: "owned-entity-not-found",
      entityId: "missing-node"
    });

    const retainedEdge = simpleSnapshot();
    retainedEdge.edges = [{ ...retainedEdge.edges[0]!, origin: "discovered" }];
    expect(createGraphCollapseChangeSet(plan, retainedEdge)).toEqual({
      ok: false,
      reason: "ownership-conflict",
      entityId: retainedEdge.edges[0]!.id
    });
  });
});
