import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphBadgeToggleExecutor } from "./GraphBadgeToggleExecutor";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import {
  GraphBadgeToggleShadowService,
  type GraphBadgeToggleShadowObservation
} from "./GraphBadgeToggleShadowService";

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

function snapshot(): GraphSnapshot {
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
      position: { x: 10, y: 20 },
      velocity: { x: 0, y: 0 },
      radius: 20,
      pinned: false,
      selected: false,
      origin: { kind: "root" }
    }],
    edges: [],
    badges: [{
      id: "A::parts",
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

function liveExecutor(): GraphBadgeToggleExecutor {
  return {
    execute: async (nextPlan) => nextPlan.kind === "unsupported"
      ? { status: "rejected", badgeId: nextPlan.badgeId, reason: "unsupported-plan" }
      : {
          status: "applied",
          badgeId: nextPlan.badgeId,
          expansionId: nextPlan.expansionId,
          effect: nextPlan.kind
        }
  };
}

describe("GraphBadgeToggleShadowService", () => {
  it("calculates the new expansion without changing the live result", async () => {
    const initial = snapshot();
    let observation: GraphBadgeToggleShadowObservation | undefined;
    const service = new GraphBadgeToggleShadowService(
      { getSnapshot: () => initial },
      {
        readNote: async (noteId) => ({
          id: noteId,
          path: noteId,
          name: "B",
          availability: "available",
          properties: {}
        })
      },
      liveExecutor(),
      { observe: (value) => { observation = value; } }
    );

    await expect(service.execute(plan)).resolves.toMatchObject({
      status: "applied",
      effect: "expand"
    });
    expect(observation?.calculation).toMatchObject({
      status: "calculated",
      result: { ok: true, effect: "expand" }
    });
    expect(initial.badges[0]?.state).toBe("collapsed");
    expect(initial.nodes).toHaveLength(1);
  });

  it("preserves live execution when shadow note reading throws", async () => {
    let observation: GraphBadgeToggleShadowObservation | undefined;
    const service = new GraphBadgeToggleShadowService(
      { getSnapshot: snapshot },
      { readNote: async () => { throw new Error("cache unavailable"); } },
      liveExecutor(),
      { observe: (value) => { observation = value; } }
    );

    await expect(service.execute(plan)).resolves.toMatchObject({ status: "applied" });
    expect(observation?.calculation.status).toBe("failed");
  });

  it("prevents an observer failure from changing live execution", async () => {
    const service = new GraphBadgeToggleShadowService(
      { getSnapshot: snapshot },
      { readNote: async () => undefined },
      liveExecutor(),
      { observe: () => { throw new Error("diagnostic failure"); } }
    );

    await expect(service.execute(plan)).resolves.toMatchObject({ status: "applied" });
  });
});
