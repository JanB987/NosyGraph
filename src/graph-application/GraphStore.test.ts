import { describe, expect, it } from "vitest";
import { GraphStore } from "./GraphStore";

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

