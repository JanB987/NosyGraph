import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  TFile: class {}, TFolder: class {}, Component: class {}, Menu: class {},
  Modal: class {}, FileView: class {}, Notice: class {}
}));

import { GraphEngine } from "./GraphEngine";

function fixture() {
  const a = { key: "a", origin: "origin-a", graphPath: "A.md", ancestry: ["Graph.md"],
    left: 0, top: 0, right: 240, bottom: 240, memberIds: new Set<string>() };
  const b = { key: "b", origin: "origin-b", graphPath: "B.md", ancestry: ["Graph.md"],
    left: 40, top: 40, right: 180, bottom: 180, memberIds: new Set<string>() };
  const nodeA = { id: "node-a", sourcePath: "Note A.md", label: "A", embeddedInstanceId: "a", x: 80, y: 100 };
  const nodeB = { id: "node-b", sourcePath: "Note B.md", label: "B", embeddedInstanceId: "b", x: 82, y: 100 };
  const outer = { id: "outer", sourcePath: "Outer.md", label: "Outer", x: 81, y: 100 };
  const engine = Object.assign(Object.create(GraphEngine.prototype), {
    embeddedGraphContainers: new Map([[a.key, a], [b.key, b]]),
    graphLensFocusOrder: new Map(), graphLensFocusSequence: 0,
    nodeMap: new Map<string, unknown>([
      ["origin-a", { id: "origin-a" }], ["origin-b", { id: "origin-b" }],
      [nodeA.id, nodeA], [nodeB.id, nodeB], [outer.id, outer]
    ]),
    nodes: [nodeA, nodeB, outer], edges: [],
    camera: { x: 0, y: 0, zoom: 1 }, nodeRadius: 6,
    canvas: { width: 400, height: 300, getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    container: { focus: vi.fn() },
    getGraphLensBounds: (container: typeof a) => container,
    getGraphLensBodyOpacity: () => 0.9,
    getRenderedNodeCenter: (node: typeof nodeA) => ({ x: node.x, y: node.y }),
    getRenderedNodeRadius: () => 10,
    requestRender: vi.fn(),
    clearNodeHoverPreview: vi.fn(), clearTopologyUpdateFreeze: vi.fn(), setGraphCursor: vi.fn(),
    lockedEmbeddedGraphContainerKeys: new Set(), removeNodeById: vi.fn()
  });
  return { engine, a, b, nodeA, nodeB, outer };
}

describe("foreground Lens stacking", () => {
  it("keeps active-lens nodes fully visible where another lens overlaps", () => {
    const { engine, a, b } = fixture();
    expect(engine.getGraphLensCoverAlphaAtPoint(80, 100, a)).toBeCloseTo(0.1);
    engine.focusGraphLens(a);
    expect(engine.getGraphLensCoverAlphaAtPoint(80, 100, a)).toBe(1);
    expect(engine.getGraphLensCoverAlphaAtPoint(80, 100, b)).toBeCloseTo(0.1);
  });

  it("draws active-lens nodes after background nodes without reordering physics storage", () => {
    const { engine, a, b, nodeA, nodeB, outer } = fixture();
    engine.focusGraphLens(a);
    expect(engine.getGraphNodesInPaintOrder()).toEqual([outer, nodeB, nodeA]);
    expect(engine.nodes).toEqual([nodeA, nodeB, outer]);
    engine.focusGraphLens(b);
    expect(engine.getGraphNodesInPaintOrder()).toEqual([outer, nodeA, nodeB]);
  });

  it("paints the foreground node last at full opacity in the actual canvas draw pass", () => {
    const { engine, a, nodeA, nodeB, outer } = fixture();
    const paints: Array<{ color: string; alpha: number }> = [];
    const stack: Array<{ color: string; alpha: number }> = [];
    const ctx = {
      globalAlpha: 1, fillStyle: "", clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(),
      save() { stack.push({ color: this.fillStyle, alpha: this.globalAlpha }); },
      restore() { const state = stack.pop()!; this.fillStyle = state.color; this.globalAlpha = state.alpha; },
      fill() { paints.push({ color: this.fillStyle, alpha: this.globalAlpha }); }
    };
    Object.assign(engine, {
      ctx, syncParentContainers: vi.fn(), syncEmbeddedGraphContainers: vi.fn(), layoutGraphLenses: vi.fn(),
      fillGraphBackground: vi.fn(), drawParentContainers: vi.fn(), drawGraphLenses: vi.fn(), drawContainerNecks: vi.fn(),
      getCombinedHoveredNodes: () => null, nodeFillColors: new Map([[nodeA.id, "red"], [nodeB.id, "blue"], [outer.id, "gray"]]),
      getNodeIcon: () => null, getNodeRenderOpacity: () => 1,
      graphStore: { isNodeSelected: () => false }, collapsePreviewNodeIds: new Set(),
      drawLabels: vi.fn(), drawMarqueeSelection: vi.fn(), suppressDomOverlayRender: true
    });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    try {
      engine.focusGraphLens(a);
      engine.draw();
      expect(paints.map((paint) => paint.color)).toEqual(["gray", "blue", "red"]);
      expect(paints[1].alpha).toBeCloseTo(0.1);
      expect(paints[2]).toEqual({ color: "red", alpha: 1 });
    } finally { vi.unstubAllGlobals(); }
  });

  it("targets the foreground lens consistently for content, frame, and drops", () => {
    const { engine, a, b } = fixture();
    engine.focusGraphLens(a);
    expect(engine.getTopGraphLensAtWorldPoint(80, 100)).toBe(a);
    expect(engine.findEmbeddedContainerAtScreenPosition(80, 100)).toBe(a);
    expect(engine.getEmbeddedGraphPathAtClientPosition(80, 100)).toBe(a.graphPath);
    engine.focusGraphLens(b);
    expect(engine.getTopGraphLensAtWorldPoint(80, 100)).toBe(b);
  });

  it("does not select a closer node behind the foreground lens", () => {
    const { engine, a, b, nodeA, nodeB } = fixture();
    engine.focusGraphLens(a);
    expect(engine.findActualNodeAtScreenPosition(82, 100)).toBe(nodeA);
    engine.focusGraphLens(b);
    expect(engine.findActualNodeAtScreenPosition(82, 100)).toBe(nodeB);
  });

  it("does not pick nodes through a lens title bar", () => {
    const { engine, a, nodeA } = fixture();
    engine.focusGraphLens(a);
    Object.assign(nodeA, { x: 80, y: 8 });
    expect(engine.findActualNodeAtScreenPosition(80, 8)).toBeNull();
  });

  it("brings a title-bar-selected lens to the front immediately", () => {
    const { engine, a, b } = fixture();
    engine.focusGraphLens(b);
    engine.findGraphLensButtonAtScreenPosition = () => null;
    engine.findGraphLensResizeTargetAtScreenPosition = () => null;
    engine.findGraphLensMoveHandleAtScreenPosition = () => a;
    engine.onMouseDown({ button: 0, altKey: false, clientX: 10, clientY: 8 });
    expect(engine.getGraphLensesTopFirst()[0]).toBe(a);
    expect(engine.requestRender).toHaveBeenCalled();
  });

  it("activates the lens whose exposed viewport is zoomed", () => {
    const { engine, a, b } = fixture();
    engine.focusGraphLens(b);
    engine.getEmbeddedContainerRenderTransform = () => ({ sourceCenterX: 0, sourceCenterY: 0, targetCenterX: 0, targetCenterY: 0, scale: 1 });
    engine.notifyEmbeddedGraphLensChanged = vi.fn();
    engine.onWheel({ preventDefault: vi.fn(), clientX: 20, clientY: 30, deltaY: -1 });
    expect(engine.getGraphLensesTopFirst()[0]).toBe(a);
  });

  it("raises a nested-lens family while preserving parent/child and sibling order", () => {
    const { engine, a, b } = fixture();
    const child = { ...b, key: "child", graphPath: "Child.md", origin: "child-origin", ancestry: ["Graph.md", "A.md"] };
    const sibling = { ...b, key: "sibling", graphPath: "Sibling.md", origin: "sibling-origin", ancestry: ["Graph.md", "A.md"] };
    engine.nodeMap.set(child.origin, { id: child.origin, embeddedInstanceId: a.key });
    engine.nodeMap.set(sibling.origin, { id: sibling.origin, embeddedInstanceId: a.key });
    engine.embeddedGraphContainers.set(child.key, child);
    engine.embeddedGraphContainers.set(sibling.key, sibling);
    engine.focusGraphLens(b);
    engine.focusGraphLens(sibling);
    engine.focusGraphLens(child);
    expect(engine.getGraphLensesTopFirst()).toEqual([child, sibling, a, b]);
    expect(engine.getGraphLensCoverAlphaAtPoint(80, 100, child)).toBe(1);
    engine.focusGraphLens(a);
    expect(engine.getGraphLensesTopFirst()).toEqual([child, sibling, a, b]);
    engine.focusGraphLens(b);
    expect(engine.getGraphLensesTopFirst()).toEqual([b, child, sibling, a]);
  });

  it("keeps foreground order when a background lens definition refreshes", () => {
    const { engine, a, b } = fixture();
    engine.focusGraphLens(a);
    engine.focusGraphLens(b);
    engine.embeddedGraphKey = (origin: string) => origin === a.origin ? a.key : b.key;
    const definition = { graphPath: a.graphPath, snapshots: [{ nodeId: "root", path: "Root.md" }] };
    engine.getEmbeddedGraphDefinitionForContainer = () => definition;
    engine.getEmbeddedGraphLensState = () => ({});
    engine.expandEmbeddedGraph = (_origin: string) => { engine.embeddedGraphContainers.set(a.key, { ...a }); return true; };
    expect(engine.replaceEmbeddedGraphInstance(a.origin, definition)).toBe(true);
    expect(engine.getGraphLensesTopFirst()[0]).toBe(b);
  });

  it("preserves focus through same-graph hydration, but clears it on a source change", () => {
    const { engine, a, b } = fixture();
    engine.focusGraphLens(b);
    engine.focusGraphLens(a);
    engine.clearEmbeddedGraphRuntime({ preserveFocus: true });
    engine.embeddedGraphContainers.set(a.key, a);
    engine.embeddedGraphContainers.set(b.key, b);
    expect(engine.getGraphLensesTopFirst()[0]).toBe(a);
    engine.clearEmbeddedGraphRuntime();
    expect(engine.graphLensFocusOrder.size).toBe(0);
  });

  it("drops closed-lens focus entries and falls back to the remaining lens", () => {
    const { engine, a, b } = fixture();
    engine.embeddedGraphKey = () => a.key;
    engine.focusGraphLens(b);
    engine.focusGraphLens(a);
    expect(engine.collapseEmbeddedGraph(a.origin, a.graphPath)).toBe(true);
    expect(engine.graphLensFocusOrder.has(a.key)).toBe(false);
    expect(engine.getTopGraphLensAtWorldPoint(80, 100)).toBe(b);
  });
});
