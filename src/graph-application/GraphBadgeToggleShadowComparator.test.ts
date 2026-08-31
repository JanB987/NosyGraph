import { describe, expect, it } from "vitest";
import { createEmptyGraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import type { GraphBadgeToggleShadowObservation } from "./GraphBadgeToggleShadowService";
import { GraphBadgeToggleShadowComparator } from "./GraphBadgeToggleShadowComparator";
import { GraphStore } from "./GraphStore";

const plan: Extract<GraphBadgeTogglePlan, { kind: "expand" }> = {
  kind: "expand",
  badgeId: "A::parts",
  expansionId: "A::parts",
  sourceNodeId: "A",
  sourceNoteId: "A.md",
  linkTypeId: "parts",
  contextId: "graph:root",
  targetNoteIds: ["B.md"],
  parentExpansionId: null
};

function beforeSnapshot(): GraphSnapshot {
  return {
    notes: [{
      id: "A.md",
      path: "A.md",
      name: "A",
      availability: "available",
      properties: {}
    }],
    nodes: [{
      id: "A",
      noteId: "A.md",
      contextId: "graph:root",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 20,
      pinned: false,
      selected: false,
      origin: { kind: "root" }
    }],
    edges: [],
    badges: [{
      id: plan.badgeId,
      nodeId: "A",
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

function successfulObservation(): GraphBadgeToggleShadowObservation {
  const before = beforeSnapshot();
  const edgeId = "edge::A::B::parts::parts";
  const changeSet = createEmptyGraphChangeSet({
    kind: "badge-expand",
    badgeId: plan.badgeId,
    expansionId: plan.expansionId
  });
  changeSet.notes = {
    upsert: [{
      id: "B.md",
      path: "B.md",
      name: "B",
      availability: "available",
      properties: {}
    }],
    removeIds: []
  };
  changeSet.nodes = {
    upsert: [{
      id: "B",
      noteId: "B.md",
      contextId: "graph:root",
      position: { x: 0, y: -120 },
      velocity: { x: 0, y: 0 },
      radius: 20,
      pinned: false,
      selected: false,
      origin: {
        kind: "badge-expansion",
        expansionId: plan.expansionId,
        sourceNodeId: "A"
      }
    }],
    removeIds: []
  };
  changeSet.edges = {
    upsert: [{
      id: edgeId,
      fromNodeId: "A",
      toNodeId: "B",
      linkTypeId: "parts",
      contextId: "graph:root",
      origin: "badge-expansion"
    }],
    removeIds: []
  };
  changeSet.badges = {
    upsert: [{
      ...before.badges[0]!,
      state: "expanded",
      expansionId: plan.expansionId
    }],
    removeIds: []
  };
  changeSet.expansions = {
    upsert: [{
      id: plan.expansionId,
      sourceNodeId: "A",
      sourceNoteId: "A.md",
      linkTypeId: "parts",
      contextId: "graph:root",
      ownedNodeIds: ["B"],
      ownedEdgeIds: [edgeId],
      childExpansionIds: []
    }],
    removeIds: []
  };
  const expectedStore = new GraphStore(before);
  if (!expectedStore.applyChangeSet(changeSet).applied) {
    throw new Error("Invalid comparison fixture");
  }
  return {
    plan,
    beforeSnapshot: before,
    afterSnapshot: expectedStore.getSnapshot(),
    calculation: {
      status: "calculated",
      result: { ok: true, effect: "expand", changeSet }
    },
    execution: {
      status: "applied",
      badgeId: plan.badgeId,
      expansionId: plan.expansionId,
      effect: "expand"
    }
  };
}

describe("GraphBadgeToggleShadowComparator", () => {
  it("matches equivalent semantic state while ignoring physics movement", () => {
    const observation = successfulObservation();
    observation.afterSnapshot = {
      ...observation.afterSnapshot,
      nodes: observation.afterSnapshot.nodes.map((node) => ({
        ...node,
        position: { x: 900, y: -400 },
        velocity: { x: 12, y: 8 },
        radius: 42
      }))
    };

    expect(new GraphBadgeToggleShadowComparator().compare(observation)).toEqual({
      status: "compared",
      matches: true,
      differences: []
    });
  });

  it("reports semantic differences by collection and entity", () => {
    const observation = successfulObservation();
    observation.afterSnapshot = {
      ...observation.afterSnapshot,
      nodes: observation.afterSnapshot.nodes.map((node) => node.id === "B"
        ? { ...node, origin: { ...node.origin, sourceNodeId: "other" } }
        : node),
      edges: observation.afterSnapshot.edges.map((edge) => ({
        ...edge,
        origin: "discovered"
      })),
      badges: observation.afterSnapshot.badges.map((badge) => ({
        ...badge,
        state: "collapsed"
      })),
      expansions: observation.afterSnapshot.expansions.map((expansion) => ({
        ...expansion,
        ownedEdgeIds: []
      }))
    };

    const result = new GraphBadgeToggleShadowComparator().compare(observation);
    expect(result).toMatchObject({ status: "compared", matches: false });
    if (result.status !== "compared") throw new Error("Expected comparison");
    expect(result.differences).toEqual([
      {
        collection: "nodes",
        entityId: "B",
        kind: "value-mismatch",
        fields: ["origin"]
      },
      {
        collection: "edges",
        entityId: "edge::A::B::parts::parts",
        kind: "value-mismatch",
        fields: ["origin"]
      },
      {
        collection: "badges",
        entityId: "A::parts",
        kind: "value-mismatch",
        fields: ["state"]
      },
      {
        collection: "expansions",
        entityId: "A::parts",
        kind: "value-mismatch",
        fields: ["ownedEdgeIds"]
      }
    ]);
  });

  it("does not compare an unapplied legacy action", () => {
    const observation = successfulObservation();
    observation.execution = {
      status: "unchanged",
      badgeId: plan.badgeId,
      expansionId: plan.expansionId,
      reason: "already-expanded"
    };

    expect(new GraphBadgeToggleShadowComparator().compare(observation)).toEqual({
      status: "not-comparable",
      reason: "legacy-not-applied"
    });
  });
});
