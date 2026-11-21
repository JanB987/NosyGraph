import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";

const { notice } = vi.hoisted(() => ({ notice: vi.fn() }));

vi.mock("obsidian", () => ({
  FileView: class {}, Modal: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, Menu: class {},
  parseYaml: (content: string) => JSON.parse(content),
  Notice: class { constructor(message: string) { notice(message); } }
}));

import { BasesGraphView } from "./GraphView";
import { O3GraphState } from "./O3GraphState";
import { O3GraphDocumentStore } from "./O3GraphDocumentStore";
import { GraphEngine } from "./GraphEngine";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(initiallyExpanded = false) {
  const state = new O3GraphState({ path: "Graph.md" } as TFile);
  if (initiallyExpanded) state.setEmbeddedGraphExpansion("A.md", "Lens.md", true);
  let saved: Record<string, unknown> = state.toPersistedState();
  const writeState = vi.fn(async (value: O3GraphState) => {
    saved = JSON.parse(JSON.stringify(value.toPersistedState()));
    return true;
  });
  const view = Object.assign(Object.create(BasesGraphView.prototype), {
    file: { path: "Graph.md" }, graphState: state,
    graphDocumentStore: { writeState },
    embeddedGraphStates: new Map(), embeddedGraphDocumentStores: new Map(),
    suppressEmbeddedGraphReloadUntil: new Map(),
    isClosingOrUnloadingGraphView: false, isHydratingGraphRuntime: false,
    embeddedGraphStateWriteQueue: Promise.resolve(),
    groupingPersistTimer: null, pendingGroupingWrite: null,
    reportedEphemeralLensOwners: new Set(),
    noteTypeIdentifiers: { graph: { property: "type", value: "[[Graph Note]]" } },
    isPersistentGraphNotePath: vi.fn(async () => true),
    engine: { getEmbeddedGraphPersistenceSnapshot: vi.fn(() => null) }
  });
  const reopened = () => {
    const next = new O3GraphState({ path: "Graph.md" } as TFile);
    next.loadFromContent("```o3graph\n" + JSON.stringify(saved) + "\n```");
    return next;
  };
  return { view, state, writeState, reopened };
}

describe("Lens open/close persistence ordering", () => {
  it.each(["window-close", "node-badge", "internal-refresh"])("writes Markdown only for user close actions, then saves reopening: %s", async (action) => {
    const graphFile = Object.assign(new TFile(), { path: "Graph.md", extension: "md" });
    const prefix = '---\n{"type":["[[Graph Note]]"]}\n---\n# Graph\n';
    const suffix = '\nKeep this paragraph.\n';
    let markdown = prefix + '```o3graph\n' + JSON.stringify({
      version: 2,
      notes: { file_1: { path: "A.md" } },
      nodes: { node_1: { noteId: "file_1", x: 0, y: 0, origin: { kind: "root" }, badges: {} } }
    }) + '\n```' + suffix;
    const modify = vi.fn(async (_file: TFile, content: string) => { markdown = content; });
    const app = { vault: {
      getAbstractFileByPath: (path: string) => path === graphFile.path ? graphFile : null,
      process: async (file: TFile, transform: (value: string) => string) => {
        const next = transform(markdown);
        if (next !== markdown) await modify(file, next);
        return markdown;
      },
      read: async () => markdown, modify
    } } as unknown as App;
    const store = new O3GraphDocumentStore(app, graphFile, {});
    const state = await store.readState({ cached: false });
    state.setEmbeddedGraphExpansion("A.md", "Lens.md", true);
    await store.writeState(state, { reason: "lens-state" });
    modify.mockClear();
    const { view } = fixture();
    Object.assign(view, { app, file: graphFile, graphState: state, graphDocumentStore: store });
    delete view.isPersistentGraphNotePath; // Use the real frontmatter ownership check.

    const origin = { id: "A.md", sourcePath: "Lens.md" };
    const engine = Object.assign(Object.create(GraphEngine.prototype), {
      nodeMap: new Map([[origin.id, origin]]), embeddedGraphContainers: new Map(),
      lockedEmbeddedGraphContainerKeys: new Set(), edges: [], camera: {}, expandedByBadge: new Map(),
      container: { focus: vi.fn() }, clearNodeHoverPreview: vi.fn(), clearTopologyUpdateFreeze: vi.fn(),
      requestRender: vi.fn(), removeNodeById: vi.fn(),
      getEmbeddedGraphLensState: vi.fn(() => ({ lensWidth: 400, lensHeight: 300 })),
      getEmbeddedGraphPersistenceSnapshot: vi.fn(() => null),
      menuOptions: {
        isGraphNote: () => true,
        onEmbeddedGraphExpansionRequested: () => ({ graphPath: "Lens.md", snapshots: [{}] }),
        onEmbeddedGraphExpansionChanged: (...args: unknown[]) => { void view.handleEmbeddedGraphExpansionChanged(...args); }
      }
    });
    view.engine = engine;
    const container = { key: engine.embeddedGraphKey("A.md", "Lens.md"), origin: "A.md", graphPath: "Lens.md", memberIds: new Set() };
    engine.embeddedGraphContainers.set(container.key, container);
    engine.findGraphLensButtonAtScreenPosition = () => ({ action: "close", container });
    if (action === "window-close") {
      engine.onMouseDown({ button: 0, clientX: 10, clientY: 10, altKey: false } as MouseEvent);
    } else if (action === "node-badge") {
      await engine.toggleEmbeddedGraph("A.md");
    } else {
      engine.collapseEmbeddedGraph("A.md", "Lens.md");
      await view.embeddedGraphStateWriteQueue;
      expect(modify).not.toHaveBeenCalled();
      expect((await store.readState({ cached: false })).listExpandedEmbeddedGraphs()).toHaveLength(1);
      return;
    }
    await view.embeddedGraphStateWriteQueue;
    expect(modify).toHaveBeenCalledTimes(1);
    expect((await store.readState({ cached: false })).listExpandedEmbeddedGraphs()).toEqual([]);

    engine.expandEmbeddedGraph = () => { engine.embeddedGraphContainers.set(container.key, container); return true; };
    await engine.toggleEmbeddedGraph("A.md");
    await view.embeddedGraphStateWriteQueue;
    expect(modify).toHaveBeenCalledTimes(2);
    expect((await store.readState({ cached: false })).listExpandedEmbeddedGraphs()).toHaveLength(1);
    expect(markdown.startsWith(prefix)).toBe(true);
    expect(markdown.endsWith(suffix)).toBe(true);
  });

  it.each([false, true])("preserves the last user action when initially expanded=%s", async (initiallyExpanded) => {
    const { view, reopened } = fixture(initiallyExpanded);
    const firstPermission = deferred<boolean>();
    view.isPersistentGraphNotePath.mockImplementationOnce(() => firstPermission.promise);
    const first = view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", !initiallyExpanded);
    const last = view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", initiallyExpanded);
    await Promise.resolve();
    firstPermission.resolve(true);
    await Promise.all([first, last]);
    expect(reopened().listExpandedEmbeddedGraphs()).toHaveLength(initiallyExpanded ? 1 : 0);
  });

  it("captures Lens snapshots before an async permission check can outlive the container", async () => {
    const { view, reopened } = fixture();
    const permission = deferred<boolean>();
    view.isPersistentGraphNotePath.mockImplementationOnce(() => permission.promise);
    const snapshot = {
      ownerGraphPath: "Graph.md", originNodeId: "A.md", graphPath: "Lens.md", parentChain: [],
      snapshots: [{ nodeId: "A.md", path: "A.md", x: 10, y: 20, pinned: false,
        origin: { kind: "root" }, badges: {} }]
    };
    view.engine.getEmbeddedGraphPersistenceSnapshot.mockReturnValue(snapshot);
    const save = view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", true, undefined, undefined, [], undefined, "instance");
    view.engine.getEmbeddedGraphPersistenceSnapshot.mockReturnValue(null);
    permission.resolve(true);
    await save;
    expect(reopened().listExpandedEmbeddedGraphs()[0]?.snapshots).toHaveLength(1);
  });

  it("does not write into a nonpersistent graph-capable note", async () => {
    notice.mockClear();
    const { view, writeState } = fixture();
    view.isPersistentGraphNotePath.mockResolvedValue(false);
    await view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", true);
    await view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", false);
    expect(writeState).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledTimes(1);
    expect(notice.mock.calls[0][0]).toContain("set type to [[Graph Note]]");
  });

  it("finishes an explicit Lens save before unloading its graph note", async () => {
    const { view, reopened } = fixture();
    view.cancelPendingViewportStateWrite = vi.fn();
    const permission = deferred<boolean>();
    view.isPersistentGraphNotePath.mockImplementationOnce(() => permission.promise);
    const save = view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", true);
    const close = view.onUnloadFile(view.file);
    permission.resolve(true);
    await Promise.all([save, close]);
    expect(reopened().listExpandedEmbeddedGraphs()).toHaveLength(1);
    expect(view.isClosingOrUnloadingGraphView).toBe(true);
  });

  it("keeps multiple Lens definitions independent when one is closed", async () => {
    const { view, reopened } = fixture();
    await view.handleEmbeddedGraphExpansionChanged("A.md", "LensA", true, undefined, undefined, [], "Types/A.md");
    await view.handleEmbeddedGraphExpansionChanged("A.md", "LensB", true, undefined, undefined, [], "Types/B.md");
    await view.handleEmbeddedGraphExpansionChanged("A.md", "LensA", false, undefined, undefined, [], "Types/A.md");
    expect(reopened().listExpandedEmbeddedGraphs()).toEqual([
      { originNodeId: "A.md", graphPath: "LensB", expanded: true, linkTypeId: "Types/B.md" }
    ]);
  });

  it("orders a Lens runtime snapshot before a later close", async () => {
    const { view, reopened, writeState } = fixture(true);
    const permission = deferred<boolean>();
    view.isPersistentGraphNotePath.mockImplementationOnce(() => permission.promise);
    view.engine.getEmbeddedGraphPersistenceSnapshot.mockReturnValue({
      ownerGraphPath: "Graph.md", originNodeId: "A.md", graphPath: "Lens.md", parentChain: [],
      snapshots: [{ nodeId: "A.md", path: "A.md", x: 25, y: 40, pinned: false,
        origin: { kind: "root" }, badges: {} }]
    });
    const runtime = view.persistEmbeddedGraphRuntime("Graph.md", "instance", "node-position");
    const close = view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", false);
    permission.resolve(true);
    await Promise.all([runtime, close]);
    expect(writeState).toHaveBeenCalledTimes(2);
    expect(reopened().listExpandedEmbeddedGraphs()).toEqual([]);
  });

  it("continues saving later actions after a failed ownership read", async () => {
    const { view, reopened } = fixture(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      view.isPersistentGraphNotePath.mockRejectedValueOnce(new Error("read failed"));
      const first = view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", true);
      const last = view.handleEmbeddedGraphExpansionChanged("A.md", "Lens.md", false);
      await Promise.all([first, last]);
      expect(reopened().listExpandedEmbeddedGraphs()).toEqual([]);
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});

describe("Cut snapshot persistence", () => {
  it("saves the empty parent-owned Lens and keeps sibling state, geometry, and the note body", async () => {
    const graphFile = Object.assign(new TFile(), { path: "Graph.md", extension: "md" });
    const scope = { originNodeId: "A.md", graphPath: "__nosygraph_lens__/Scope.md", expanded: true as const,
      linkTypeId: "Scope.md", lens: { lensWidth: 420, viewZoom: 0.75 } };
    const node = (path: string): import("./O3GraphState").O3GraphRuntimeNodeSnapshot =>
      ({ nodeId: path, path, x: 100, y: 50, pinned: true, origin: { kind: "root" }, badges: {} });
    const original = new O3GraphState(graphFile);
    original.migrateToCurrentLayout([node("A.md"), node("Keep.md")]);
    original.setEmbeddedGraphExpansion(scope.originNodeId, scope.graphPath, true, scope.lens, [], scope.linkTypeId);
    original.setEmbeddedGraphSnapshots(scope.originNodeId, scope.graphPath, [node("B.md")]);
    original.setEmbeddedGraphExpansion("B.md", "Nested.md", true, { lensWidth: 360 }, [scope]);
    const prefix = '---\n{"type":"[[Graph Note]]","rootNodes":["[[A]]","[[Keep]]"]}\n---\nKeep this body.\n\n';
    const fence = String.fromCharCode(96).repeat(3);
    let markdown = prefix + fence + "o3graph\n" + JSON.stringify(original.toPersistedState()) + "\n" + fence;
    const app = { vault: {
      read: async () => markdown,
      process: async (_file: TFile, write: (content: string) => string) => { markdown = write(markdown); return markdown; }
    } } as unknown as App;
    const store = new O3GraphDocumentStore(app, graphFile, {});
    const state = await store.readState({ cached: false });
    const snapshot = {
      ownerGraphPath: graphFile.path, originNodeId: scope.originNodeId, graphPath: scope.graphPath, parentChain: [],
      snapshots: [] as ReturnType<O3GraphState["toRuntimeNodeSnapshots"]>
    };
    const view = Object.assign(Object.create(BasesGraphView.prototype), {
      app, file: graphFile, graphState: state, graphDocumentStore: store, hasCompletedInitialGraphRuntimeHydration: true,
      cutDirtyOwners: new Set<string>(), isPersistentGraphNotePath: vi.fn(async path => path === graphFile.path),
      engine: { getRuntimeNodeSnapshots: () => [node("A.md"), node("Keep.md")], getOpenCutLensSnapshots: () => [snapshot] }
    });
    view.stageCutRuntime(graphFile, [{ ...snapshot, snapshots: [node("B.md")] }], [node("A.md"), node("Keep.md")]);
    const savedOwners = new Set<string>();
    await view.persistAfterCut([], savedOwners);
    const reopened = await store.readState({ cached: false });
    expect(savedOwners).toEqual(new Set(["Graph.md"]));
    expect(reopened.listExpandedEmbeddedGraphs()).toEqual([scope]);
    expect(reopened.toRuntimeNodeSnapshots()).toEqual([node("A.md"), node("Keep.md")]);
    expect(markdown.startsWith(prefix)).toBe(true);
  });

  it("does not recreate a state block removed just before a Cut reconciliation write", async () => {
    const graphFile = Object.assign(new TFile(), { path: "Graph.md", extension: "md" });
    const original = new O3GraphState(graphFile);
    const fence = String.fromCharCode(96).repeat(3);
    let markdown = "Graph body\n" + fence + "o3graph\n" + JSON.stringify(original.toPersistedState()) + "\n" + fence;
    const app = { vault: {
      read: async () => markdown,
      process: async (_file: TFile, write: (content: string) => string) => {
        markdown = "The user's changed body.";
        markdown = write(markdown);
        return markdown;
      }
    } } as unknown as App;
    const store = new O3GraphDocumentStore(app, graphFile, {});
    const state = await store.readState({ cached: false });
    state.state.viewport = { x: 10, y: 10, zoom: 2 };
    await expect(store.writeState(state, {
      reason: "note-truth-reconciliation", requireExistingBlock: true, forceEmptyOverwrite: true
    })).rejects.toThrow("state block was removed");
    expect(markdown).toBe("The user's changed body.");
  });
});
