import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
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
      nodes: [],
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
    const controller = new GraphController(new GraphStore(), {
      queries: new GraphQueries({ getSnapshot: () => snapshot }),
      badgePort: {
        toggleBadge: (badge) => { calls.push(`toggle:${badge.id}`); },
        openBadgeInput: (badge) => { calls.push(`input:${badge.id}`); },
        expandBadgeChain: async (badge) => { calls.push(`chain:${badge.id}`); }
      }
    });
    return { controller, calls };
  }

  it("resolves a stable badge ID before invoking the legacy port", async () => {
    const { controller, calls } = badgeSetup();

    expect(await controller.executeBadge({ type: "toggle-badge", badgeId: "A.md::parts" }))
      .toEqual({ handled: true, badgeId: "A.md::parts" });
    await controller.executeBadge({ type: "open-badge-input", badgeId: "A.md::parts" });
    await controller.executeBadge({ type: "expand-badge-chain", badgeId: "A.md::parts" });

    expect(calls).toEqual([
      "toggle:A.md::parts",
      "input:A.md::parts",
      "chain:A.md::parts"
    ]);
  });

  it("does not call the port for an unknown badge", async () => {
    const { controller, calls } = badgeSetup();

    expect(await controller.executeBadge({ type: "toggle-badge", badgeId: "missing" }))
      .toEqual({ handled: false, badgeId: "missing", reason: "badge-not-found" });
    expect(calls).toEqual([]);
  });

  it("reports a missing legacy port", async () => {
    const snapshot: GraphSnapshot = {
      nodes: [], notes: [], edges: [], expansions: [], lenses: [],
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
});
