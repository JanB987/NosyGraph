import { describe, expect, it } from "vitest";
import type { GraphBadge } from "../graph-domain/GraphBadge";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphNote } from "../graph-domain/GraphNote";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphBadgeExpandPlan } from "./GraphExpansionChangeSet";
import {
  createContextGraphNodeId,
  createDuplicateGraphNodeId,
  DefaultGraphExpansionTargetMaterializer,
  RadialGraphExpansionNodePlacer,
  type GraphExpansionNoteReader,
  type GraphExpansionNodePlacer
} from "./GraphExpansionTargetMaterializer";
import { GraphQueries } from "./GraphQueries";

const sourceNode: GraphNodeInstance = {
  id: "instance:A",
  noteId: "A.md",
  contextId: "graph:root",
  position: { x: 100, y: 100 },
  velocity: { x: 0, y: 0 },
  radius: 20,
  pinned: false,
  selected: false,
  origin: { kind: "root" }
};

const plan: GraphBadgeExpandPlan = {
  kind: "expand",
  badgeId: "instance:A::parts",
  expansionId: "instance:A::parts",
  sourceNodeId: sourceNode.id,
  sourceNoteId: sourceNode.noteId,
  linkTypeId: "parts",
  contextId: sourceNode.contextId,
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

function note(id: string, availability: GraphNote["availability"] = "available"): GraphNote {
  return {
    id,
    path: id,
    name: id.replace(/\.md$/, ""),
    availability,
    properties: {}
  };
}

function snapshot(overrides: Partial<GraphSnapshot> = {}): GraphSnapshot {
  return {
    notes: [note("A.md")],
    nodes: [sourceNode],
    edges: [],
    badges: [badge],
    expansions: [],
    lenses: [],
    ...overrides
  };
}

function setup(
  graphSnapshot = snapshot(),
  readNote: GraphExpansionNoteReader["readNote"] = async (id) => note(id),
  nodePlacer: GraphExpansionNodePlacer = { place: () => ({ x: 25, y: 50 }) }
) {
  const materializer = new DefaultGraphExpansionTargetMaterializer(
    new GraphQueries({ getSnapshot: () => graphSnapshot }),
    { readNote },
    nodePlacer,
    { defaultNodeRadius: 24, preferredDistance: 160 }
  );
  return materializer;
}

describe("DefaultGraphExpansionTargetMaterializer", () => {
  it("reads and materializes a new target without host objects", async () => {
    const result = await setup().materialize(plan, badge);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toEqual([{
      note: note("B.md"),
      node: {
        id: "B.md",
        noteId: "B.md",
        contextId: "graph:root",
        position: { x: 25, y: 50 },
        velocity: { x: 0, y: 0 },
        radius: 24,
        pinned: false,
        selected: false,
        origin: {
          kind: "badge-expansion",
          expansionId: plan.expansionId,
          sourceNodeId: plan.sourceNodeId
        }
      },
      edge: {
        id: "edge::instance:A::B.md::parts::parts",
        fromNodeId: "instance:A",
        toNodeId: "B.md",
        linkTypeId: "parts",
        contextId: "graph:root",
        origin: "discovered"
      }
    }]);
  });

  it("reuses an existing node and semantic edge", async () => {
    const existingNode: GraphNodeInstance = {
      ...sourceNode,
      id: "root:B",
      noteId: "B.md",
      origin: { kind: "root" }
    };
    const existingEdge = {
      id: "visible::A-B",
      fromNodeId: sourceNode.id,
      toNodeId: existingNode.id,
      linkTypeId: plan.linkTypeId,
      contextId: plan.contextId,
      origin: "visible" as const
    };
    const graphSnapshot = snapshot({
      notes: [note("A.md"), note("B.md")],
      nodes: [sourceNode, existingNode],
      edges: [existingEdge]
    });
    let reads = 0;
    const result = await setup(graphSnapshot, async () => {
      reads += 1;
      return undefined;
    }).materialize(plan, badge);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(reads).toBe(0);
    expect(result.targets[0]).toEqual({
      note: note("B.md"),
      node: existingNode,
      edge: existingEdge
    });
  });

  it("does not count a reused sibling twice when placing a new node", async () => {
    const existingNode: GraphNodeInstance = {
      ...sourceNode,
      id: "B.md",
      noteId: "B.md"
    };
    const graphSnapshot = snapshot({
      notes: [note("A.md"), note("B.md")],
      nodes: [sourceNode, existingNode],
      edges: [{
        id: "edge::existing",
        fromNodeId: sourceNode.id,
        toNodeId: existingNode.id,
        linkTypeId: plan.linkTypeId,
        contextId: plan.contextId,
        origin: "discovered"
      }]
    });
    const siblingIndexes: number[] = [];
    const result = await setup(
      graphSnapshot,
      async (id) => note(id),
      {
        place: (input) => {
          siblingIndexes.push(input.siblingIndex);
          return { x: 0, y: 0 };
        }
      }
    ).materialize({ ...plan, targetNoteIds: ["B.md", "C.md"] }, badge);

    expect(result.ok).toBe(true);
    expect(siblingIndexes).toEqual([1]);
  });

  it("creates stable duplicate and embedded-context node identities", async () => {
    const duplicateBadge = { ...badge, duplicateNodes: true };
    const result = await setup().materialize(plan, duplicateBadge);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets[0]?.node.id).toBe(
      createDuplicateGraphNodeId("instance:A", "B.md", "parts")
    );
    expect(createContextGraphNodeId("Folder/B.md", "embedded:lens 1")).toBe(
      "__o3embed__::lens%201::Folder%2FB.md"
    );
  });

  it("keeps unresolved links as explicitly missing notes", async () => {
    const result = await setup(
      snapshot(),
      async (id) => note(id, "missing")
    ).materialize(plan, badge);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets[0]?.note.availability).toBe("missing");
  });

  it("returns explicit failures for stale or unavailable inputs", async () => {
    expect(await setup().materialize(plan, { ...badge, state: "expanded" })).toEqual({
      ok: false,
      reason: "badge-outdated"
    });
    expect(await setup(snapshot({ nodes: [] })).materialize(plan, badge)).toEqual({
      ok: false,
      reason: "source-node-not-found"
    });
    expect(await setup(snapshot(), async () => undefined).materialize(plan, badge)).toEqual({
      ok: false,
      reason: "target-note-unavailable",
      targetNoteId: "B.md"
    });
    expect(await setup(snapshot(), async () => note("Other.md")).materialize(plan, badge)).toEqual({
      ok: false,
      reason: "target-note-outdated",
      targetNoteId: "B.md"
    });
  });
});

describe("RadialGraphExpansionNodePlacer", () => {
  it("places the first child above its source at the configured distance", () => {
    const position = new RadialGraphExpansionNodePlacer().place({
      sourceNode,
      targetNote: note("B.md"),
      siblingIndex: 0,
      nodeRadius: 20,
      preferredDistance: 160
    });

    expect(position.x).toBeCloseTo(100);
    expect(position.y).toBeCloseTo(-20);
  });
});
