import { describe, expect, it } from "vitest";
import { createEmptyGraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import { GraphBadgeToggleTransitionService } from "./GraphBadgeToggleTransitionService";
import type {
  GraphExpansionTransitionCreator,
  GraphExpansionTransitionResult
} from "./GraphExpansionTransitionService";
import { GraphQueries } from "./GraphQueries";

const expandPlan: Extract<GraphBadgeTogglePlan, { kind: "expand" }> = {
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

const collapsePlan: Extract<GraphBadgeTogglePlan, { kind: "collapse" }> = {
  kind: "collapse",
  badgeId: expandPlan.badgeId,
  expansionId: expandPlan.expansionId,
  sourceNodeId: expandPlan.sourceNodeId,
  sourceNoteId: expandPlan.sourceNoteId,
  linkTypeId: expandPlan.linkTypeId,
  contextId: expandPlan.contextId
};

function expandedSnapshot(): GraphSnapshot {
  const edgeId = "edge::A::B::parts::parts";
  return {
    notes: [
      {
        id: "A.md",
        path: "A.md",
        name: "A",
        availability: "available",
        properties: {}
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
        id: "A",
        noteId: "A.md",
        contextId: "graph:root",
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        radius: 20,
        pinned: false,
        selected: false,
        origin: { kind: "root" }
      },
      {
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
          expansionId: collapsePlan.expansionId,
          sourceNodeId: "A"
        }
      }
    ],
    edges: [{
      id: edgeId,
      fromNodeId: "A",
      toNodeId: "B",
      linkTypeId: "parts",
      contextId: "graph:root",
      origin: "badge-expansion"
    }],
    badges: [{
      id: collapsePlan.badgeId,
      nodeId: "A",
      linkTypeId: "parts",
      contextId: "graph:root",
      label: "Parts",
      color: "#4488cc",
      state: "expanded",
      semantic: "link",
      hasRelationships: true,
      duplicateNodes: false,
      expansionId: collapsePlan.expansionId
    }],
    expansions: [{
      id: collapsePlan.expansionId,
      sourceNodeId: "A",
      sourceNoteId: "A.md",
      linkTypeId: "parts",
      contextId: "graph:root",
      ownedNodeIds: ["B"],
      ownedEdgeIds: [edgeId],
      childExpansionIds: []
    }],
    lenses: []
  };
}

function setup(
  expansionResult: GraphExpansionTransitionResult,
  graphSnapshot = expandedSnapshot()
) {
  let expansionCalls = 0;
  let snapshotReads = 0;
  const expansionTransitions: GraphExpansionTransitionCreator = {
    create: async () => {
      expansionCalls += 1;
      return expansionResult;
    }
  };
  const queries = new GraphQueries({
    getSnapshot: () => {
      snapshotReads += 1;
      return graphSnapshot;
    }
  });
  const service = new GraphBadgeToggleTransitionService(queries, expansionTransitions);
  return {
    service,
    expansionCalls: () => expansionCalls,
    snapshotReads: () => snapshotReads
  };
}

describe("GraphBadgeToggleTransitionService", () => {
  it("delegates expansion and returns a uniform ready transition", async () => {
    const changeSet = createEmptyGraphChangeSet({
      kind: "badge-expand",
      badgeId: expandPlan.badgeId,
      expansionId: expandPlan.expansionId
    });
    const context = setup({ ok: true, changeSet });

    expect(await context.service.create(expandPlan)).toEqual({
      ok: true,
      effect: "expand",
      changeSet
    });
    expect(context.expansionCalls()).toBe(1);
    expect(context.snapshotReads()).toBe(0);
  });

  it("calculates collapse directly from one current snapshot", async () => {
    const unusedExpansion = createEmptyGraphChangeSet({
      kind: "badge-expand",
      badgeId: expandPlan.badgeId,
      expansionId: expandPlan.expansionId
    });
    const context = setup({ ok: true, changeSet: unusedExpansion });
    const result = await context.service.create(collapsePlan);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect).toBe("collapse");
    expect(result.changeSet.cause.kind).toBe("badge-collapse");
    expect(result.changeSet.nodes.removeIds).toEqual(["B"]);
    expect(context.expansionCalls()).toBe(0);
    expect(context.snapshotReads()).toBe(1);
  });

  it("rejects unsupported plans before reading either branch", async () => {
    const context = setup({
      ok: false,
      stage: "state",
      reason: "badge-not-found"
    });
    const unsupported: GraphBadgeTogglePlan = {
      kind: "unsupported",
      badgeId: expandPlan.badgeId,
      reason: "unsupported-action"
    };

    expect(await context.service.create(unsupported)).toEqual({
      ok: false,
      branch: "plan",
      failure: { reason: "unsupported-action" }
    });
    expect(context.expansionCalls()).toBe(0);
    expect(context.snapshotReads()).toBe(0);
  });

  it("preserves branch-specific failure information", async () => {
    const expansionFailure: GraphExpansionTransitionResult = {
      ok: false,
      stage: "materialization",
      reason: "target-note-unavailable",
      targetNoteId: "B.md"
    };
    expect(await setup(expansionFailure).service.create(expandPlan)).toEqual({
      ok: false,
      branch: "expand",
      failure: expansionFailure
    });

    const staleCollapse = expandedSnapshot();
    staleCollapse.expansions = [];
    const collapseResult = await setup(expansionFailure, staleCollapse).service.create(collapsePlan);
    expect(collapseResult).toEqual({
      ok: false,
      branch: "collapse",
      failure: { ok: false, reason: "expansion-not-found" }
    });
  });
});
