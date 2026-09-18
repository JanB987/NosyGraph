import { describe, expect, it } from "vitest";
import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphExpansion } from "../graph-domain/GraphExpansion";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type {
  GraphBadgeExpandPlan,
  MaterializedGraphExpansionTarget
} from "./GraphExpansionChangeSet";
import type { GraphExpansionTargetMaterializer } from "./GraphExpansionTargetMaterializer";
import { GraphExpansionTransitionService } from "./GraphExpansionTransitionService";
import { GraphQueries } from "./GraphQueries";
import { GraphStore } from "./GraphStore";

const plan: GraphBadgeExpandPlan = {
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

const sourceNode: GraphNodeInstance = {
  id: plan.sourceNodeId,
  noteId: plan.sourceNoteId,
  contextId: plan.contextId,
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  radius: 20,
  pinned: false,
  selected: false,
  origin: { kind: "root" }
};

const targetNote: GraphNote = {
  id: "B.md",
  path: "B.md",
  name: "B",
  availability: "available",
  properties: {}
};

const target: MaterializedGraphExpansionTarget = {
  note: targetNote,
  node: {
    id: "B.md",
    noteId: targetNote.id,
    contextId: plan.contextId,
    position: { x: 0, y: -120 },
    velocity: { x: 0, y: 0 },
    radius: 20,
    pinned: false,
    selected: false,
    origin: {
      kind: "badge-expansion",
      expansionId: plan.expansionId,
      sourceNodeId: plan.sourceNodeId
    }
  },
  edge: {
    id: "edge::A::B.md::parts::parts",
    fromNodeId: plan.sourceNodeId,
    toNodeId: "B.md",
    linkTypeId: plan.linkTypeId,
    contextId: plan.contextId,
    origin: "badge-expansion"
  },
  badges: []
};

function snapshot(overrides: Partial<GraphSnapshot> = {}): GraphSnapshot {
  return {
    notes: [{
      id: "A.md",
      path: "A.md",
      name: "A",
      availability: "available",
      properties: {}
    }],
    nodes: [sourceNode],
    badges: [badge],
    edges: [],
    expansions: [],
    lenses: [],
    ...overrides
  };
}

function materializer(
  result: Awaited<ReturnType<GraphExpansionTargetMaterializer["materialize"]>> = {
    ok: true,
    targets: [target]
  }
): GraphExpansionTargetMaterializer {
  return { materialize: async () => result };
}

function service(
  graphSnapshot: GraphSnapshot,
  targetMaterializer = materializer()
): GraphExpansionTransitionService {
  return new GraphExpansionTransitionService(
    new GraphQueries({ getSnapshot: () => graphSnapshot }),
    targetMaterializer
  );
}

describe("GraphExpansionTransitionService", () => {
  it("creates a complete atomic transition", async () => {
    const result = await service(snapshot()).create(plan);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.cause).toEqual({
      kind: "badge-expand",
      badgeId: plan.badgeId,
      expansionId: plan.expansionId
    });
    expect(result.changeSet.notes.upsert).toEqual([targetNote]);
    expect(result.changeSet.nodes.upsert).toEqual([target.node]);
    expect(result.changeSet.badges.upsert[0]).toMatchObject({
      id: badge.id,
      state: "expanded",
      expansionId: plan.expansionId
    });
  });

  it("produces a change set accepted atomically by GraphStore", async () => {
    const store = new GraphStore(snapshot());
    const transition = new GraphExpansionTransitionService(
      new GraphQueries(store),
      materializer()
    );
    const result = await transition.create(plan);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(store.applyChangeSet(result.changeSet)).toEqual({
      applied: true,
      changeCount: 5
    });
    expect(store.getSnapshot()).toMatchObject({
      notes: [expect.objectContaining({ id: "A.md" }), targetNote],
      nodes: [sourceNode, target.node],
      edges: [target.edge],
      badges: [expect.objectContaining({ state: "expanded" })],
      expansions: [expect.objectContaining({ id: plan.expansionId })]
    });
  });

  it("includes the current parent expansion in a nested transition", async () => {
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
    const nestedPlan = { ...plan, parentExpansionId: parent.id };
    const result = await service(snapshot({ expansions: [parent] })).create(nestedPlan);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.expansions.upsert[0]).toEqual({
      ...parent,
      childExpansionIds: [plan.expansionId]
    });
  });

  it("stops before materialization when required state is absent", async () => {
    let calls = 0;
    const targetMaterializer: GraphExpansionTargetMaterializer = {
      materialize: async () => {
        calls += 1;
        return { ok: true, targets: [target] };
      }
    };

    expect(await service(snapshot({ badges: [] }), targetMaterializer).create(plan)).toEqual({
      ok: false,
      stage: "state",
      reason: "badge-not-found"
    });
    expect(await service(snapshot(), targetMaterializer).create({
      ...plan,
      parentExpansionId: "missing-parent"
    })).toEqual({
      ok: false,
      stage: "state",
      reason: "parent-expansion-not-found"
    });
    expect(calls).toBe(0);
  });

  it("preserves materialization and change-set failure stages", async () => {
    expect(await service(snapshot(), materializer({
      ok: false,
      reason: "target-note-unavailable",
      targetNoteId: "B.md"
    })).create(plan)).toEqual({
      ok: false,
      stage: "materialization",
      reason: "target-note-unavailable",
      targetNoteId: "B.md"
    });

    const invalidTarget = {
      ...target,
      edge: { ...target.edge, linkTypeId: "other" }
    };
    expect(await service(snapshot(), materializer({
      ok: true,
      targets: [invalidTarget]
    })).create(plan)).toEqual({
      ok: false,
      stage: "change-set",
      reason: "target-outdated",
      targetNoteId: "B.md"
    });
  });

  it("rechecks live badge state after asynchronous materialization", async () => {
    let current = snapshot();
    const targetMaterializer: GraphExpansionTargetMaterializer = {
      materialize: async () => {
        current = snapshot({
          badges: [{ ...badge, state: "expanded", expansionId: plan.expansionId }]
        });
        return { ok: true, targets: [target] };
      }
    };
    const transition = new GraphExpansionTransitionService(
      new GraphQueries({ getSnapshot: () => current }),
      targetMaterializer
    );

    expect(await transition.create(plan)).toEqual({
      ok: false,
      stage: "change-set",
      reason: "badge-outdated"
    });
  });
});
