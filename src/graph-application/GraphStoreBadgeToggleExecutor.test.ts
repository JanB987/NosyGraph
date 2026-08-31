import { describe, expect, it } from "vitest";
import { createEmptyGraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphBadgeTogglePlan } from "./GraphBadgeTogglePlan";
import type {
  GraphBadgeToggleTransitionCreator,
  GraphBadgeToggleTransitionResult
} from "./GraphBadgeToggleTransitionService";
import { GraphStore } from "./GraphStore";
import { GraphStoreBadgeToggleExecutor } from "./GraphStoreBadgeToggleExecutor";

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
      position: { x: 0, y: 0 },
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

function successfulTransition(): GraphBadgeToggleTransitionResult {
  const changeSet = createEmptyGraphChangeSet({
    kind: "badge-expand",
    badgeId: plan.badgeId,
    expansionId: plan.expansionId
  });
  changeSet.notes = {
    upsert: [{ ...snapshot().notes[0]!, name: "Changed" }],
    removeIds: []
  };
  return { ok: true, effect: "expand", changeSet };
}

function creator(
  create: GraphBadgeToggleTransitionCreator["create"]
): GraphBadgeToggleTransitionCreator {
  return { create };
}

describe("GraphStoreBadgeToggleExecutor", () => {
  it("calculates and applies a transition against one store revision", async () => {
    const store = new GraphStore(snapshot());
    const executor = new GraphStoreBadgeToggleExecutor(
      store,
      creator(async () => successfulTransition())
    );

    await expect(executor.execute(plan)).resolves.toEqual({
      status: "applied",
      badgeId: plan.badgeId,
      expansionId: plan.expansionId,
      effect: "expand"
    });
    expect(store.getSnapshot().notes[0]?.name).toBe("Changed");
    expect(store.getRevision()).toBe(1);
  });

  it("rejects unsupported plans without calculating a transition", async () => {
    let calls = 0;
    const executor = new GraphStoreBadgeToggleExecutor(
      new GraphStore(snapshot()),
      creator(async () => {
        calls += 1;
        return successfulTransition();
      })
    );

    await expect(executor.execute({
      kind: "unsupported",
      badgeId: plan.badgeId,
      reason: "unsupported-action"
    })).resolves.toEqual({
      status: "rejected",
      badgeId: plan.badgeId,
      reason: "unsupported-plan"
    });
    expect(calls).toBe(0);
  });

  it("reports a transition calculation failure without changing the store", async () => {
    const store = new GraphStore(snapshot());
    const executor = new GraphStoreBadgeToggleExecutor(
      store,
      creator(async () => ({
        ok: false,
        branch: "plan",
        failure: { reason: "unsupported-action" }
      }))
    );

    await expect(executor.execute(plan)).resolves.toMatchObject({
      status: "rejected",
      reason: "transition-failed"
    });
    expect(store.getRevision()).toBe(0);
  });

  it("rejects a transition when the store changes while it is calculated", async () => {
    const store = new GraphStore(snapshot());
    const executor = new GraphStoreBadgeToggleExecutor(
      store,
      creator(async () => {
        store.toggleSelection("A");
        return successfulTransition();
      })
    );

    await expect(executor.execute(plan)).resolves.toMatchObject({
      status: "rejected",
      reason: "stale-transition"
    });
    expect(store.getSnapshot().notes[0]?.name).toBe("A");
    expect(store.isNodeSelected("A")).toBe(true);
  });

  it("reports a store validation rejection", async () => {
    const invalid = successfulTransition();
    if (!invalid.ok) throw new Error("Expected a successful fixture");
    invalid.changeSet.edges = {
      upsert: [{
        id: "broken",
        fromNodeId: "A",
        toNodeId: "missing",
        linkTypeId: "parts",
        contextId: "graph:root",
        origin: "badge-expansion"
      }],
      removeIds: []
    };
    const store = new GraphStore(snapshot());
    const executor = new GraphStoreBadgeToggleExecutor(
      store,
      creator(async () => invalid)
    );

    await expect(executor.execute(plan)).resolves.toMatchObject({
      status: "rejected",
      reason: "store-rejected"
    });
    expect(store.getRevision()).toBe(0);
  });
});
