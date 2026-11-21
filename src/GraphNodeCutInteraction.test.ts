import { describe, it, expect, vi } from "vitest";
const { menus } = vi.hoisted(() => ({ menus: [] as Array<Array<{ title?: string; disabled?: boolean; click?: () => void }>> }));
vi.mock("obsidian", () => ({
  App: class {}, FileView: class {}, Component: class {}, EventRef: class {}, TFile: class {}, TFolder: class {}, Modal: class {}, Notice: class {},
  FuzzySuggestModal: class {}, Plugin: class {}, PluginSettingTab: class {}, MarkdownRenderChild: class {}, MarkdownView: class {}, Setting: class {},
  Menu: class {
    items: Array<{ title?: string; disabled?: boolean; click?: () => void }> = [];
    constructor() { menus.push(this.items); }
    addItem(build: (item: unknown) => void) {
      const record = {};
      const item = { setTitle: (title: string) => { Object.assign(record, { title }); return item; },
        setIcon: () => item, setDisabled: (disabled: boolean) => { Object.assign(record, { disabled }); return item; },
        onClick: (click: () => void) => { Object.assign(record, { click }); return item; } };
      build(item); this.items.push(record);
    }
    addSeparator() {}
    showAtMouseEvent() {}
  }
}));
import { GraphEngine } from "./GraphEngine";
import { BasesGraphView } from "./GraphView";
import BasesGraphPlugin from "./main";
import { TFile } from "obsidian";
import { ObsidianGraphLinkMutationHandler } from "./ObsidianGraphLinkMutationHandler";
import { GraphNodeClipboardState } from "./GraphNodeClipboard";
import { ObsidianGraphNodeCutHost, type GraphCutSurface } from "./ObsidianGraphNodeCutHost";

function keyboardFixture() {
  const cut = vi.fn();
  const engine = Object.assign(Object.create(GraphEngine.prototype), {
    menuOptions: { onCutSelectedNodes: cut },
    isEditableKeyboardTarget: () => false,
    getSelectedNodeCutRefs: () => [{ nodeId: "A", path: "A.md", origin: { kind: "graph-membership", ownerPath: "Lens.md" } }],
    updateAltDragFreeze: vi.fn(), dragPointerClient: {},
    normalizeKeyboardKey: (key: string) => key.toLowerCase()
  });
  const event = { key: "x", ctrlKey: true, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  return { engine, cut, event };
}

describe("production graph Cut entry points", () => {
  it("uses the Copy payload for repeated body, frontmatter and property-widget pastes", async () => {
    let clipboard = "";
    vi.stubGlobal("navigator", { clipboard: { writeText: async (text: string) => { clipboard = text; } } });
    const file = Object.assign(new TFile(), { path: "A.md" });
    const generateMarkdownLink = vi.fn(() => "[[A]]");
    const app = { vault: { getAbstractFileByPath: () => file },
      fileManager: { generateMarkdownLink }, workspace: { getActiveFile: () => file } };
    const graphNodeClipboard = new GraphNodeClipboardState();
    const plugin = Object.assign(Object.create(BasesGraphPlugin.prototype), { app, graphNodeClipboard });
    const view = Object.assign(Object.create(BasesGraphView.prototype), {
      app, file: { path: "Owner.md" }, engine: { getSelectedNodePaths: () => ["A.md", "A.md"] },
      onGraphNodeLinksCopied: (paths: string[], text: string) => graphNodeClipboard.remember(paths, text)
    });
    await view.copySelectedNodeLinksToClipboard();
    const copied = clipboard;
    await view.publishNodeLinks(["A.md"]);
    expect(clipboard).toBe(copied);
    expect(clipboard).toBe("[[A]]");
    const event = { defaultPrevented: false, clipboardData: { getData: () => clipboard } };
    const replaceSelection = vi.fn();
    const editor = { lineCount: () => 3, getLine: (line: number) => ["---", "members: ", "---"][line],
      getCursor: () => ({ line: 1, ch: 9 }), replaceSelection };
    expect(plugin.handleGraphNodeLinksFrontmatterPaste(event, editor, { file })).toBe(true);
    expect(plugin.handleGraphNodeLinksFrontmatterPaste(event, editor, { file })).toBe(true);
    expect(replaceSelection.mock.calls[0][0]).toContain('- "[[A]]"');
    generateMarkdownLink.mockReturnValue('[A "quoted"](folder\\A.md)');
    expect(plugin.handleGraphNodeLinksFrontmatterPaste(event, editor, { file: { path: "Elsewhere/Target.md" } })).toBe(true);
    expect(generateMarkdownLink).toHaveBeenLastCalledWith(file, "Elsewhere/Target.md");
    expect(replaceSelection).toHaveBeenLastCalledWith(expect.stringContaining(String.raw`- "[A \"quoted\"](folder\\A.md)"`), "paste");
    expect(graphNodeClipboard.match(clipboard)).toEqual(["A.md"]);
    expect(plugin.handleGraphNodeLinksFrontmatterPaste({ ...event, clipboardData: { getData: () => "[[External]]" } }, editor, { file })).toBe(false);
    editor.getCursor = () => ({ line: 4, ch: 0 });
    expect(plugin.handleGraphNodeLinksFrontmatterPaste(event, editor, { file })).toBe(false);
    expect(clipboard).toBe("[[A]]"); // Body paste uses the published plain text.
    class MockElement {
      closest(selector: string) { return selector.includes("data-property-key") ? { dataset: { propertyKey: "members" } } : {}; }
      instanceOf() { return false; }
    }
    vi.stubGlobal("Element", MockElement);
    vi.stubGlobal("HTMLElement", MockElement);
    const add = vi.spyOn(ObsidianGraphLinkMutationHandler.prototype, "applyBadgeLinkAdd").mockResolvedValue({ added: [], skipped: [] } as never);
    plugin.handleGraphNodeLinksPropertiesPaste({ ...event, target: new MockElement(), preventDefault() {}, stopImmediatePropagation() {} });
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ sources: [{ nodeId: "A.md", path: "A.md" }], property: "members" }));
    plugin.handleGraphNodeLinksPropertiesPaste({ ...event, clipboardData: { getData: () => "[[External]]" }, target: new MockElement() });
    expect(add).toHaveBeenCalledTimes(1);
    add.mockRestore();
    vi.unstubAllGlobals();
  });

  it.each(["ctrlKey", "metaKey"])("handles %s+X once and ignores repeated events", modifier => {
    const { engine, cut, event } = keyboardFixture();
    engine.onContainerKeyDown({ ...event, ctrlKey: false, [modifier]: true });
    engine.onContainerKeyDown({ ...event, repeat: true });
    expect(cut).toHaveBeenCalledTimes(1);
    expect(cut).toHaveBeenCalledWith([{ nodeId: "A", path: "A.md", origin: { kind: "graph-membership", ownerPath: "Lens.md" } }]);
  });
  it("preserves editable text and ignores Alt/Shift modifiers", () => {
    const { engine, cut, event } = keyboardFixture();
    engine.onContainerKeyDown({ ...event, shiftKey: true });
    engine.onContainerKeyDown({ ...event, altKey: true });
    engine.isEditableKeyboardTarget = () => true;
    engine.onContainerKeyDown(event);
    expect(cut).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not route Cut through the last graph once a Markdown editor or note menu has focus", () => {
    const hasCutFocus = vi.fn(() => true);
    const surface = { hasCutFocus } as unknown as GraphCutSurface;
    const host = new ObsidianGraphNodeCutHost({} as never, () => ({} as never), () => [surface], vi.fn());
    const element = { closest: () => null } as unknown as Element;
    const prompt = { closest: (selector: string) => selector === ".prompt" ? {} : null } as unknown as Element;
    host.trackFocus(element);
    hasCutFocus.mockReturnValue(false);
    expect(host.focusedSurface(prompt)).toBe(surface);
    expect(host.focusedSurface(element)).toBeUndefined();
    host.trackFocus(element);
    expect(host.focusedSurface(prompt)).toBeUndefined();
  });
  it("projects nested membership ownership independently from persistence ownership", () => {
    const engine = Object.assign(Object.create(GraphEngine.prototype), {
      getSelectedNodes: () => [{ id: "nested", sourcePath: "A.md", embeddedRoot: true, stateOwnerPath: "Parent.md", embeddedInstanceId: "one" }],
      getGraphNodeMutationRef: () => ({ path: "A.md" }),
      collectCutExpansionClaims: () => new Map(),
      embeddedGraphContainers: new Map([["one", { graphPath: "Lens.md", persistenceOwnerPath: "Parent.md" }]])
    });
    expect(engine.getSelectedNodeCutRefs()).toEqual([{ nodeId: "nested", path: "A.md", origin: { kind: "graph-membership", ownerPath: "Lens.md" }, contextId: "one" }]);
  });
  it.each([false, true])("captures menu selection and follows right-click selection rules (already selected=%s)", selected => {
    const { engine, cut } = keyboardFixture();
    const node = { id: "A", embeddedRoot: false };
    Object.assign(engine, {
      container: { focus: vi.fn() }, findActualNodeAtScreenPosition: () => node,
      graphStore: { isNodeSelected: () => selected }, selectOnlyNode: vi.fn(),
      getSelectedNodes: () => [node], isNodePinned: () => false,
      getExpandedEmbeddedContainerForOrigin: () => null,
      menuOptions: { onCutSelectedNodes: cut, onCopySelectedNodeLinks: vi.fn(), canCutSelectedNodes: () => true }
    });
    engine.onContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 });
    const items = menus.at(-1)!;
    const copyIndex = items.findIndex(item => item.title === "Copy node link");
    expect(items[copyIndex + 1].title).toBe("Cut node");
    engine.getSelectedNodeCutRefs = () => [];
    items[copyIndex + 1].click!();
    expect(cut.mock.calls[0][0]).toHaveLength(1);
    expect(engine.selectOnlyNode).toHaveBeenCalledTimes(selected ? 0 : 1);
  });
  it("uses the foreground transformed hit region for node clicks and marquee, with global Select All", () => {
    const background = { id: "background" };
    const classic = { id: "classic", embeddedInstanceId: "classic-lens" };
    const nested = { id: "nested", embeddedInstanceId: "nested-lens" };
    const clipped = { id: "clipped", embeddedInstanceId: "nested-lens" };
    const lens = { key: "nested-lens", left: 0, top: 0, right: 80, bottom: 80 };
    const nodeCenters = new Map([["background", { x: 44, y: 40 }], ["classic", { x: 42, y: 40 }],
      ["nested", { x: 43, y: 40 }], ["clipped", { x: 81, y: 40 }]]);
    const graphController = { replaceSelection: vi.fn(() => ({ changed: true })), selectAll: vi.fn(() => ({ changed: true })) };
    const engine = Object.assign(Object.create(GraphEngine.prototype), {
      nodes: [background, classic, nested, clipped], graphController,
      canvas: { getBoundingClientRect: () => ({ left: 100, top: 100 }) }, camera: { x: 0, y: 0, zoom: 2 },
      getTopGraphLensAtWorldPoint: (x: number) => x <= 80 ? lens : null,
      getGraphLensBounds: () => lens,
      isWorldPointInGraphLensTitleBar: (_x: number, y: number) => y < 12,
      getRenderedNodeCenter: (node: { id: string }) => nodeCenters.get(node.id),
      getRenderedNodeRadius: () => 8,
      isRenderedPointInsideNodeLens: (node: { embeddedInstanceId?: string }, x: number) => !node.embeddedInstanceId || x <= 80,
      getCanvasPoint: (x: number, y: number) => ({ x, y }), requestRender: vi.fn(),
      marqueeSelection: { startX: 0, startY: 0 }
    });
    expect(engine.findActualNodeAtScreenPosition(188, 180)).toBe(nested);
    expect(engine.findActualNodeAtScreenPosition(184, 110)).toBeNull();
    expect(engine.findActualNodeAtScreenPosition(262, 180)).toBeNull();
    engine.updateMarqueeSelection({ clientX: 180, clientY: 160, altKey: true });
    expect(graphController.replaceSelection).toHaveBeenCalledWith(["nested"]);
    engine.selectAllNodes();
    expect(graphController.selectAll).toHaveBeenCalledWith(["background", "classic", "nested", "clipped"]);
  });

  it("replaces an empty lens definition while retaining the existing lens geometry", () => {
    const lens = { lensWidth: 400, viewZoom: 2 };
    const engine = Object.assign(Object.create(GraphEngine.prototype), {
      nodeMap: new Map([["Origin", {}]]), embeddedGraphContainers: new Map([["Origin::Lens.md", {}]]),
      embeddedGraphKey: () => "Origin::Lens.md", getEmbeddedGraphDefinitionForContainer: () => ({ lens }),
      collapseEmbeddedGraph: vi.fn(), expandEmbeddedGraph: vi.fn(() => true)
    });
    expect(engine.replaceEmbeddedGraphInstance("Origin", { graphPath: "Lens.md", snapshots: [] })).toBe(true);
    expect(engine.expandEmbeddedGraph).toHaveBeenCalledWith("Origin", { graphPath: "Lens.md", snapshots: [], lens });
  });
});
