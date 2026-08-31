import { describe, expect, it } from "vitest";
import { createEmptyGraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphNodeInstance } from "../graph-domain/GraphNodeInstance";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphStore } from "./GraphStore";

function node(
  id: string,
  noteId = `${id}.md`,
  selected = false
): GraphNodeInstance {
  return {
    id,
    noteId,
    contextId: "graph:root",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    radius: 20,
    pinned: false,
    selected,
    origin: { kind: "root" }
  };
}

function snapshot(): GraphSnapshot {
  return {
    notes: [{
      id: "A.md",
      path: "A.md",
      name: "A",
      availability: "available",
      properties: { nested: { tags: ["one"] } }
    }],
    nodes: [node("A", "A.md", true)],
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

describe("GraphStore selection", () => {
  it("selects one node and reports idempotent commands", () => {
    const store = new GraphStore();

    expect(store.selectOnly("A.md")).toBe(true);
    expect(store.selectOnly("A.md")).toBe(false);
    expect(store.getSelectedNodeIds()).toEqual(["A.md"]);
    expect(store.getSelectedNodeCount()).toBe(1);
    expect(store.isNodeSelected("A.md")).toBe(true);
  });

  it("toggles, replaces, and clears selection", () => {
    const store = new GraphStore();

    expect(store.toggleSelection("A.md")).toBe(true);
    expect(store.toggleSelection("B.md")).toBe(true);
    expect(store.getSelectedNodeIds()).toEqual(["A.md", "B.md"]);
    expect(store.toggleSelection("A.md")).toBe(true);
    expect(store.getSelectedNodeIds()).toEqual(["B.md"]);

    expect(store.replaceSelection(["C.md", "C.md", "D.md"])).toBe(true);
    expect(store.replaceSelection(["D.md", "C.md"])).toBe(false);
    expect(store.getSelectedNodeIds()).toEqual(["C.md", "D.md"]);
    expect(store.clearSelection()).toBe(true);
    expect(store.clearSelection()).toBe(false);
    expect(store.getSelectedNodeIds()).toEqual([]);
  });

  it("returns detached selection arrays and ignores empty IDs", () => {
    const store = new GraphStore();
    store.replaceSelection(["A.md", "  "]);

    const returned = store.getSelectedNodeIds() as string[];
    returned.push("B.md");

    expect(store.getSelectedNodeIds()).toEqual(["A.md"]);
  });
});

describe("GraphStore graph changes", () => {
  it("applies every expansion collection as one valid snapshot", () => {
    const store = new GraphStore(snapshot());
    const changeSet = createEmptyGraphChangeSet({
      kind: "badge-expand",
      badgeId: "A::parts",
      expansionId: "A::parts"
    });
    const targetNode: GraphNodeInstance = {
      ...node("B", "B.md"),
      origin: {
        kind: "badge-expansion",
        expansionId: "A::parts",
        sourceNodeId: "A"
      }
    };
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
    changeSet.nodes = { upsert: [targetNode], removeIds: [] };
    changeSet.edges = {
      upsert: [{
        id: "edge::A::B::parts::parts",
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
        ...snapshot().badges[0]!,
        state: "expanded",
        expansionId: "A::parts"
      }],
      removeIds: []
    };
    changeSet.expansions = {
      upsert: [{
        id: "A::parts",
        sourceNodeId: "A",
        sourceNoteId: "A.md",
        linkTypeId: "parts",
        contextId: "graph:root",
        ownedNodeIds: ["B"],
        ownedEdgeIds: ["edge::A::B::parts::parts"],
        childExpansionIds: []
      }],
      removeIds: []
    };

    expect(store.applyChangeSet(changeSet)).toEqual({ applied: true, changeCount: 5 });
    const next = store.getSnapshot();
    expect(next.notes.map((item) => item.id)).toEqual(["A.md", "B.md"]);
    expect(next.nodes.map((item) => item.id)).toEqual(["A", "B"]);
    expect(next.edges).toHaveLength(1);
    expect(next.badges[0]).toMatchObject({ state: "expanded", expansionId: "A::parts" });
    expect(next.expansions[0]?.ownedNodeIds).toEqual(["B"]);
    expect(store.getSelectedNodeIds()).toEqual(["A"]);
  });

  it("returns detached snapshots", () => {
    const store = new GraphStore(snapshot());
    const first = store.getSnapshot();
    (first.nodes[0]!.position as { x: number }).x = 500;
    (first.notes[0]!.properties as Record<string, unknown>).changed = true;
    const nested = first.notes[0]!.properties.nested as { tags: string[] };
    nested.tags.push("two");

    const second = store.getSnapshot();
    expect(second.nodes[0]?.position.x).toBe(0);
    expect(second.notes[0]?.properties.changed).toBeUndefined();
    expect(second.notes[0]?.properties.nested).toEqual({ tags: ["one"] });
  });

  it("rejects conflicting IDs without changing state or selection", () => {
    const store = new GraphStore(snapshot());
    const before = store.getSnapshot();
    const changeSet = createEmptyGraphChangeSet({
      kind: "badge-collapse",
      badgeId: "A::parts",
      expansionId: "A::parts"
    });
    changeSet.nodes = { upsert: [node("A", "A.md")], removeIds: ["A"] };

    expect(store.applyChangeSet(changeSet)).toEqual({
      applied: false,
      reason: "conflicting-id",
      collection: "nodes",
      entityId: "A"
    });
    expect(store.getSnapshot()).toEqual(before);
    expect(store.getSelectedNodeIds()).toEqual(["A"]);
  });

  it("rejects missing references without partially applying other collections", () => {
    const store = new GraphStore(snapshot());
    const changeSet = createEmptyGraphChangeSet({
      kind: "badge-expand",
      badgeId: "A::parts",
      expansionId: "A::parts"
    });
    changeSet.notes = {
      upsert: [{
        id: "unused.md",
        path: "unused.md",
        name: "Unused",
        availability: "available",
        properties: {}
      }],
      removeIds: []
    };
    changeSet.edges = {
      upsert: [{
        id: "broken-edge",
        fromNodeId: "A",
        toNodeId: "missing-node",
        linkTypeId: "parts",
        contextId: "graph:root",
        origin: "discovered"
      }],
      removeIds: []
    };

    expect(store.applyChangeSet(changeSet)).toEqual({
      applied: false,
      reason: "missing-reference",
      collection: "edges",
      entityId: "broken-edge",
      referenceId: "missing-node"
    });
    expect(store.getSnapshot().notes.map((item) => item.id)).toEqual(["A.md"]);
    expect(store.getSnapshot().edges).toEqual([]);
  });

  it("rejects cyclic nested expansion ownership", () => {
    const store = new GraphStore(snapshot());
    const changeSet = createEmptyGraphChangeSet({
      kind: "badge-expand",
      badgeId: "A::parts",
      expansionId: "one"
    });
    changeSet.expansions = {
      upsert: [
        {
          id: "one",
          sourceNodeId: "A",
          sourceNoteId: "A.md",
          linkTypeId: "parts",
          contextId: "graph:root",
          ownedNodeIds: [],
          ownedEdgeIds: [],
          childExpansionIds: ["two"]
        },
        {
          id: "two",
          sourceNodeId: "A",
          sourceNoteId: "A.md",
          linkTypeId: "parts",
          contextId: "graph:root",
          ownedNodeIds: [],
          ownedEdgeIds: [],
          childExpansionIds: ["one"]
        }
      ],
      removeIds: []
    };

    expect(store.applyChangeSet(changeSet)).toEqual({
      applied: false,
      reason: "expansion-cycle",
      collection: "expansions",
      entityId: "one"
    });
    expect(store.getSnapshot().expansions).toEqual([]);
  });

  it("removes selection when its owned node is removed", () => {
    const initial = snapshot();
    initial.badges = [];
    const store = new GraphStore(initial);
    const changeSet = createEmptyGraphChangeSet({
      kind: "badge-collapse",
      badgeId: "A::parts",
      expansionId: "A::parts"
    });
    changeSet.nodes = { upsert: [], removeIds: ["A"] };
    changeSet.notes = { upsert: [], removeIds: ["A.md"] };

    expect(store.applyChangeSet(changeSet).applied).toBe(true);
    expect(store.getSelectedNodeIds()).toEqual([]);
    expect(store.getSnapshot().nodes).toEqual([]);
  });
});
