import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphBadgeRequest } from "./GraphBadgeRequest";
import { GraphController } from "./GraphController";
import { GraphQueries } from "./GraphQueries";
import { GraphStore } from "./GraphStore";

function setup(): { controller: GraphController; store: GraphStore } {
  const store = new GraphStore();
  return { controller: new GraphController(store), store };
}

describe("GraphController selection commands", () => {
  it("executes select-only and reports whether state changed", () => {
    const { controller, store } = setup();

    expect(controller.selectOnly("A.md")).toEqual({
      changed: true,
      selectedNodeIds: ["A.md"],
      selectedNodeCount: 1
    });
    expect(controller.selectOnly("A.md").changed).toBe(false);
    expect(store.getSelectedNodeIds()).toEqual(["A.md"]);
  });

  it("executes toggle, replace, select-all, and clear commands", () => {
    const { controller } = setup();

    controller.toggleSelection("A.md");
    expect(controller.toggleSelection("B.md").selectedNodeIds).toEqual(["A.md", "B.md"]);
    expect(controller.replaceSelection(["C.md"]).selectedNodeIds).toEqual(["C.md"]);
    expect(controller.selectAll(["A.md", "B.md", "C.md"]).selectedNodeCount).toBe(3);
    expect(controller.clearSelection()).toEqual({
      changed: true,
      selectedNodeIds: [],
      selectedNodeCount: 0
    });
    expect(controller.clearSelection().changed).toBe(false);
  });

  it("accepts the serializable command union", () => {
    const { controller } = setup();

    const result = controller.executeSelection({
      type: "replace-selection",
      nodeIds: ["A.md", "B.md"]
    });

    expect(result.selectedNodeIds).toEqual(["A.md", "B.md"]);
  });
});

describe("GraphController badge commands", () => {
  function badgeSetup() {
    const snapshot: GraphSnapshot = {
      nodes: [{
        id: "A.md",
        noteId: "A.md",
        contextId: "graph:root",
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        radius: 20,
        pinned: false,
        selected: false,
        origin: { kind: "root" }
      }],
      notes: [],
      badges: [{
        id: "A.md::parts",
        nodeId: "A.md",
        linkTypeId: "parts",
        contextId: "graph:root",
        label: "Parts",
        color: "#4488cc",
        state: "collapsed",
        semantic: "link",
        hasRelationships: true,
        duplicateNodes: false
      }],
      edges: [],
      expansions: [],
      lenses: []
    };
    const calls: string[] = [];
    const requests: GraphBadgeRequest[] = [];
    const controller = new GraphController(new GraphStore(), {
      queries: new GraphQueries({ getSnapshot: () => snapshot }),
      badgePort: {
        executeBadge: async (request) => {
          requests.push(request);
          calls.push(`${request.action}:${request.nodeId}:${request.noteId}`);
        }
      }
    });
    return { controller, calls, requests };
  }

  it("resolves a stable badge ID before invoking the legacy port", async () => {
    const { controller, calls, requests } = badgeSetup();

    expect(await controller.executeBadge({ type: "toggle-badge", badgeId: "A.md::parts" }))
      .toEqual({ handled: true, badgeId: "A.md::parts" });
    await controller.executeBadge({ type: "open-badge-input", badgeId: "A.md::parts" });
    await controller.executeBadge({ type: "expand-badge-chain", badgeId: "A.md::parts" });

    expect(calls).toEqual([
      "toggle-badge:A.md:A.md",
      "open-badge-input:A.md:A.md",
      "expand-badge-chain:A.md:A.md"
    ]);
    expect(requests[0]).toEqual({
      action: "toggle-badge",
      badgeId: "A.md::parts",
      nodeId: "A.md",
      noteId: "A.md",
      linkTypeId: "parts",
      contextId: "graph:root",
      semantic: "link"
    });
  });

  it("does not call the port for an unknown badge", async () => {
    const { controller, calls } = badgeSetup();

    expect(await controller.executeBadge({ type: "toggle-badge", badgeId: "missing" }))
      .toEqual({ handled: false, badgeId: "missing", reason: "badge-not-found" });
    expect(calls).toEqual([]);
  });

  it("reports a missing legacy port", async () => {
    const snapshot: GraphSnapshot = {
      nodes: [{
        id: "A.md", noteId: "A.md", contextId: "graph:root",
        position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, radius: 20,
        pinned: false, selected: false, origin: { kind: "root" }
      }],
      notes: [], edges: [], expansions: [], lenses: [],
      badges: [{
        id: "A.md::parts", nodeId: "A.md", linkTypeId: "parts", contextId: "graph:root",
        label: "Parts", color: "#4488cc", state: "collapsed", semantic: "link",
        hasRelationships: true, duplicateNodes: false
      }]
    };
    const controller = new GraphController(new GraphStore(), {
      queries: new GraphQueries({ getSnapshot: () => snapshot })
    });

    expect(await controller.executeBadge({ type: "toggle-badge", badgeId: "A.md::parts" }))
      .toEqual({ handled: false, badgeId: "A.md::parts", reason: "badge-port-unavailable" });
  });

  it("does not create a request when the badge node is unavailable", async () => {
    const snapshot: GraphSnapshot = {
      nodes: [], notes: [], edges: [], expansions: [], lenses: [],
      badges: [{
        id: "A.md::parts", nodeId: "A.md", linkTypeId: "parts", contextId: "graph:root",
        label: "Parts", color: "#4488cc", state: "collapsed", semantic: "link",
        hasRelationships: true, duplicateNodes: false
      }]
    };
    const calls: string[] = [];
    const controller = new GraphController(new GraphStore(), {
      queries: new GraphQueries({ getSnapshot: () => snapshot }),
      badgePort: { executeBadge: () => { calls.push("called"); } }
    });

    expect(await controller.executeBadge({ type: "toggle-badge", badgeId: "A.md::parts" }))
      .toEqual({ handled: false, badgeId: "A.md::parts", reason: "node-not-found" });
    expect(calls).toEqual([]);
  });
});
