import { describe, expect, it } from "vitest";
import { GraphController } from "./GraphController";
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

