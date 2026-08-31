import { describe, expect, it } from "vitest";
import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphEdge } from "../graph-domain/GraphEdge";
import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { GraphBadgeExpandPlan } from "./GraphExpansionChangeSet";
import {
  createGraphExpansionChangeSet,
  type MaterializedGraphExpansionTarget
} from "./GraphExpansionChangeSet";

const plan: GraphBadgeExpandPlan = {
  kind: "expand",
  badgeId: "instance:A::parts",
  expansionId: "instance:A::parts",
  sourceNodeId: "instance:A",
  sourceNoteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root",
  targetNoteIds: ["B.md", "C.md"],
  parentExpansionId: null
};

const badge: GraphBadge = {
  id: plan.badgeId,
  nodeId: plan.sourceNodeId,
  linkTypeId: plan.linkTypeId,
  contextId: plan.contextId,
  label: "Parts",
  color: "#4488cc",
  state: "collapsed",
  semantic: "link",
  hasRelationships: true,
  duplicateNodes: false
};

function target(noteId: string, suffix = noteId): MaterializedGraphExpansionTarget {
  const note: GraphNote = {
    id: noteId,
    path: noteId,
    name: noteId.replace(/\.md$/, ""),
    availability: "available",
    properties: {}
  };
  const node: GraphNodeInstance = {
    id: `instance:A::parts::${suffix}`,
    noteId,
    contextId: plan.contextId,
    position: { x: 10, y: 20 },
    velocity: { x: 0, y: 0 },
    radius: 20,
    pinned: false,
    selected: false,
    origin: {
      kind: "badge-expansion",
      expansionId: plan.expansionId,
      sourceNodeId: plan.sourceNodeId
    }
  };
  const edge: GraphEdge = {
    id: `${plan.sourceNodeId}->${node.id}::parts`,
    fromNodeId: plan.sourceNodeId,
    toNodeId: node.id,
    linkTypeId: plan.linkTypeId,
    contextId: plan.contextId,
    origin: "discovered"
  };
  return { note, node, edge };
}

describe("createGraphExpansionChangeSet", () => {
  it("creates ordered entity upserts and expansion ownership", () => {
    const b = target("B.md");
    const c = target("C.md");
    const result = createGraphExpansionChangeSet({
      plan,
      badge,
      targets: [c, b]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.cause).toEqual({
      kind: "badge-expand",
      badgeId: plan.badgeId,
      expansionId: plan.expansionId
    });
    expect(result.changeSet.notes.upsert.map((note) => note.id)).toEqual(["B.md", "C.md"]);
    expect(result.changeSet.nodes.upsert).toEqual([b.node, c.node]);
    expect(result.changeSet.edges.upsert).toEqual([b.edge, c.edge]);
    expect(result.changeSet.badges.upsert).toEqual([{
      ...badge,
      state: "expanded",
      expansionId: plan.expansionId
    }]);
    expect(result.changeSet.expansions.upsert).toEqual([{
      id: plan.expansionId,
      sourceNodeId: plan.sourceNodeId,
      sourceNoteId: plan.sourceNoteId,
      linkTypeId: plan.linkTypeId,
      contextId: plan.contextId,
      ownedNodeIds: [b.node.id, c.node.id],
      ownedEdgeIds: [b.edge.id, c.edge.id],
      childExpansionIds: []
    }]);
  });

  it("records an empty expansion when no relationships resolve", () => {
    const result = createGraphExpansionChangeSet({
      plan: { ...plan, targetNoteIds: [] },
      badge,
      targets: []
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.notes.upsert).toEqual([]);
    expect(result.changeSet.expansions.upsert[0]).toMatchObject({
      id: plan.expansionId,
      ownedNodeIds: [],
      ownedEdgeIds: []
    });
    expect(result.changeSet.badges.upsert[0]?.state).toBe("expanded");
  });

  it("can own a reused node without replacing its original origin", () => {
    const reused = target("B.md");
    reused.node = {
      ...reused.node,
      id: "existing:B",
      origin: { kind: "root" }
    };
    reused.edge = {
      ...reused.edge,
      toNodeId: reused.node.id
    };
    const result = createGraphExpansionChangeSet({
      plan: { ...plan, targetNoteIds: ["B.md"] },
      badge,
      targets: [reused]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.nodes.upsert[0]?.origin).toEqual({ kind: "root" });
    expect(result.changeSet.expansions.upsert[0]?.ownedNodeIds).toEqual(["existing:B"]);
  });

  it("adds a nested expansion to its parent's child ownership", () => {
    const parent: GraphExpansion = {
      id: "root::related",
      sourceNodeId: "root",
      sourceNoteId: "Root.md",
      linkTypeId: "related",
      contextId: plan.contextId,
      ownedNodeIds: [plan.sourceNodeId],
      ownedEdgeIds: [],
      childExpansionIds: []
    };
    const result = createGraphExpansionChangeSet({
      plan: { ...plan, targetNoteIds: [], parentExpansionId: parent.id },
      badge,
      targets: [],
      parentExpansion: parent
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.expansions.upsert).toEqual([
      { ...parent, childExpansionIds: [plan.expansionId] },
      expect.objectContaining({ id: plan.expansionId })
    ]);
  });

  it("rejects stale badges, parent expansions, and target sets", () => {
    expect(createGraphExpansionChangeSet({
      plan,
      badge: { ...badge, state: "expanded" },
      targets: [target("B.md"), target("C.md")]
    })).toEqual({ ok: false, reason: "badge-outdated" });
    expect(createGraphExpansionChangeSet({
      plan: { ...plan, parentExpansionId: "parent" },
      badge,
      targets: [target("B.md"), target("C.md")]
    })).toEqual({ ok: false, reason: "parent-expansion-outdated" });
    expect(createGraphExpansionChangeSet({
      plan,
      badge,
      targets: [target("B.md")]
    })).toEqual({ ok: false, reason: "target-set-mismatch" });
  });

  it("rejects target entities that do not implement the plan", () => {
    const invalid = target("B.md");
    invalid.edge = { ...invalid.edge, linkTypeId: "other" };

    expect(createGraphExpansionChangeSet({
      plan,
      badge,
      targets: [invalid, target("C.md")]
    })).toEqual({ ok: false, reason: "target-outdated", targetNoteId: "B.md" });
  });

  it("rejects node and edge identities shared by different targets", () => {
    const b = target("B.md");
    const duplicateNode = target("C.md");
    duplicateNode.node = { ...duplicateNode.node, id: b.node.id };
    duplicateNode.edge = { ...duplicateNode.edge, toNodeId: b.node.id };
    expect(createGraphExpansionChangeSet({
      plan,
      badge,
      targets: [b, duplicateNode]
    })).toEqual({ ok: false, reason: "duplicate-node-id", targetNoteId: "C.md" });

    const duplicateEdge = target("C.md");
    duplicateEdge.edge = { ...duplicateEdge.edge, id: b.edge.id };
    expect(createGraphExpansionChangeSet({
      plan,
      badge,
      targets: [b, duplicateEdge]
    })).toEqual({ ok: false, reason: "duplicate-edge-id", targetNoteId: "C.md" });
  });
});
