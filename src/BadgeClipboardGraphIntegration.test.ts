import { afterEach, describe, expect, it, vi } from "vitest";
import { TFile, type App, type WorkspaceLeaf } from "obsidian";

vi.mock("obsidian", () => {
  class Component {
    cleanups: Array<() => void> = [];
    register(cleanup: () => void) { this.cleanups.push(cleanup); }
  }
  return {
    Component, TFile: class {}, TFolder: class {}, Modal: class {}, Notice: class {}, MarkdownView: class {},
    FileView: class { constructor(leaf: object) { Object.assign(this, leaf); } },
    Plugin: class { constructor(readonly app: unknown) {} },
    MarkdownRenderChild: class extends Component { constructor(readonly containerEl: unknown) { super(); } },
    FuzzySuggestModal: class {}, PluginSettingTab: class {}, Setting: class {}, Menu: class {}
  };
});

import { GraphEngine, type GraphEngineMenuOptions } from "./GraphEngine";
import { BasesGraphView } from "./GraphView";
import BasesGraphPlugin from "./main";
import { O3LinkType } from "./O3LinkType";
import { ObsidianGraphLinkInputHandler } from "./ObsidianGraphLinkInputHandler";
import { ObsidianGraphLinkMutationHandler } from "./ObsidianGraphLinkMutationHandler";
import { requestGraphBadgeInput, type GraphBadgeInputIntegration } from "./ObsidianGraphBadgeInputHost";
import type { BadgeMembershipOption, BadgeInputEntry } from "./graph-application/GraphBadgeInputSubmission";
import type { BadgeMembershipPreferencePort } from "./graph-application/BadgeMembershipPreference";
import { DEFAULT_GRAPH_PROPERTY_KEYS } from "./GraphPropertyKeys";
import { DEFAULT_NOTE_TYPE_IDENTIFIERS } from "./NoteTypeIdentifier";
import { DEFAULT_LINK_TYPE_PROPERTY_KEYS } from "./NoteTypePropertyKeys";
import type { MatchGraphNodeClipboard } from "./GraphNodeClipboard";
import type {
  GraphBadgeBatchCommitted, GraphBadgeInputResult, GraphBadgeLinkInputRequest, GraphLinkWriteDescriptor
} from "./graph-application/GraphLinkMutation";

function file(path: string): TFile {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return Object.assign(new TFile(), { path, name, extension: "md", basename: name.slice(0, -3) });
}

function fixture() {
  const clicked = file("Folder/Clicked.md");
  const pasted = file("Folder/Pasted.md");
  const graph = file("Graph.md");
  const definition = file("Definitions/Badge.md");
  const alternate = file("Definitions/Alternate.md");
  const files = new Map([clicked, pasted, graph, definition, alternate].map((value) => [value.path, value]));
  const fm = { key: "Badge", properties: ["relationship", "equivalent"], writeProperty: "relationship", direction: "outgoing", LinkDiscoveryDirection: "incoming" };
  const alternateFm = { ...fm, writeProperty: "equivalent" };
  const frontmatter = new Map<string, Record<string, unknown>>([
    [definition.path, fm], [alternate.path, alternateFm], [graph.path, { rootNodes: ["[[Folder/Clicked]]"] }]
  ]);
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path),
      getMarkdownFiles: () => [...files.values()],
      cachedRead: async () => ""
    },
    metadataCache: {
      getFileCache: (value: TFile) => ({ frontmatter: frontmatter.get(value.path) }),
      getFirstLinkpathDest: (path: string) => files.get(path) ?? files.get(`${path}.md`)
    },
    workspace: { getLeavesOfType: vi.fn((): unknown[] => []), iterateAllLeaves: vi.fn() },
    loadLocalStorage: () => null
  };
  return {
    app, files, frontmatter, graph, clicked, pasted, definition, fm,
    linkType: new O3LinkType(definition, fm), alternateType: new O3LinkType(alternate, alternateFm)
  };
}

interface EngineInternals {
  menuOptions: GraphEngineMenuOptions;
  nodes: Array<{ id: string; sourcePath: string; embeddedInstanceId?: string; embeddedDefinitionPath?: string }>;
  nodeMap: Map<string, EngineInternals["nodes"][number]>;
  activeNodeBadgeLinkTypes: O3LinkType[];
  visibleNodeBadgeLinkTypes: O3LinkType[];
  embeddedGraphContainers: Map<string, unknown>;
  expandedByBadge: Map<string, unknown>;
  openBadgeLinkInput(id: string, linkType: O3LinkType): Promise<void>;
  getBadgeLinkWriteDescriptor(target: GraphLinkWriteDescriptor["target"], linkType: O3LinkType): GraphLinkWriteDescriptor;
  syncVisibleLinkTypeEdgesAfterBadgeMutation(...args: unknown[]): void;
  refreshBadgeExpansionAfterMutation(...args: unknown[]): void;
  refreshEmbeddedBadgeExpansionAfterMutation(...args: unknown[]): void;
  requestRender(): void;
}

function engineFor(f: ReturnType<typeof fixture>, options: Partial<GraphEngineMenuOptions> = {}) {
  const engine = new GraphEngine({} as HTMLElement, f.app as unknown as App, {
    initialSettings: {
      repulsionStrength: 1, centerStrength: 1, nodeRadius: 10, nodeConnectionSizeMultiplier: 1,
      nearRestVelocityThreshold: 1, restVelocityThreshold: 2, textFadeThreshold: 1
    }, ...options
  });
  return { engine, runtime: engine as unknown as EngineInternals };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("production badge input and refresh routing", () => {
  it("serializes preference saves with other settings and ignores an older failure", async () => {
    const f = fixture();
    const plugin = new BasesGraphPlugin(f.app as unknown as App, {} as never);
    const preference = plugin.badgeMembershipPreference;
    expect(preference.get()).toEqual({ value: true, saving: false });
    let rejectOlder!: (reason: Error) => void;
    const olderSave = new Promise<void>((_resolve, reject) => { rejectOlder = reject; });
    const saveData = vi.fn(async (_settings: object) => {}).mockImplementationOnce(async () => olderSave);
    Object.assign(plugin, { saveData });
    const seen = vi.fn();
    const unsubscribe = preference.subscribe(seen);
    const older = preference.set(false).catch((error: unknown) => error);
    await vi.waitFor(() => expect(saveData).toHaveBeenCalledTimes(1));
    plugin.settings.defaultNodeLimit = 84;
    const newer = preference.set(true);
    const unrelated = plugin.savePluginSettings();
    expect(preference.get()).toEqual({ value: true, saving: true });
    rejectOlder(new Error("Could not save older value"));
    await expect(older).resolves.toBeInstanceOf(Error);
    await Promise.all([newer, unrelated]);
    expect(saveData.mock.calls.map(([settings]) => settings)).toEqual([
      expect.objectContaining({ badgeInputAddToMembership: false }),
      expect.objectContaining({ badgeInputAddToMembership: true, defaultNodeLimit: 84 }),
      expect.objectContaining({ badgeInputAddToMembership: true, defaultNodeLimit: 84 })
    ]);
    expect(preference.get()).toEqual({ value: true, saving: false });
    expect(seen.mock.calls.map(([state]) => state)).toEqual([
      { value: false, saving: true }, { value: true, saving: true }, { value: true, saving: false }
    ]);
    saveData.mockRejectedValueOnce(new Error("Denied"));
    await expect(preference.set(false)).rejects.toThrow("Denied");
    expect(preference.get()).toEqual({ value: true, saving: false });
    unsubscribe();
    seen.mockClear();
    await preference.set(false);
    expect(seen).not.toHaveBeenCalled();
  });

  it.each([
    ["Force Based", "link"], ["Direction Based", "link"], ["parent", "parent"], ["lens", "lens"]
  ] as const)("captures the exact %s definition in a nested graph and revalidates write configuration", async (kind, semantic) => {
    const f = fixture();
    const fm = { ...f.fm, linkType: kind };
    f.frontmatter.set(f.definition.path, fm);
    const clickedDefinition = new O3LinkType(f.definition, fm);
    const requestInput = vi.fn((_request: GraphBadgeLinkInputRequest) => {});
    const { runtime } = engineFor(f, { onGraphLinkInputRequested: requestInput });
    const node = { id: "nested::clicked", sourcePath: f.clicked.path, embeddedInstanceId: "nested", embeddedDefinitionPath: f.graph.path };
    runtime.nodeMap.set("outer::clicked", { id: "outer::clicked", sourcePath: f.clicked.path });
    runtime.nodeMap.set(node.id, node);
    runtime.activeNodeBadgeLinkTypes = [f.alternateType];
    runtime.embeddedGraphContainers.set("nested", { graphPath: f.graph.path, persistenceOwnerPath: "Outer.md", linkTypes: [f.alternateType, clickedDefinition], visibleLinkTypeDefinitions: [] });
    await runtime.openBadgeLinkInput(node.id, clickedDefinition);
    const request = requestInput.mock.calls[0][0];
    expect(request).toMatchObject({
      membership: { kind: "note", ownerPath: f.graph.path, referencePath: f.clicked.path, instanceId: "nested" },
      write: {
        target: { nodeId: node.id, path: f.clicked.path }, property: "relationship",
        definitionId: f.definition.path, readProperties: ["relationship", "equivalent"],
        discoveryDirection: "incoming", semantic
      }
    });
    expect(request.isCurrent()).toBe(true);
    f.frontmatter.set(f.definition.path, { ...fm, writeProperty: "equivalent" });
    expect(request.isCurrent()).toBe(false);
    f.frontmatter.set(f.definition.path, fm);
    runtime.nodeMap.delete(node.id);
    expect(request.isCurrent()).toBe(false);
  });

  it("projects membership from the immediate Lens origin and definition", async () => {
    const f = fixture();
    const lensSource = f.graph.path;
    const enclosing = file("Definitions/Scope.md");
    const lens = new O3LinkType(enclosing, { linkType: "lens", properties: ["scope", "deliverables"], writeProperty: "deliverables" });
    const requestInput = vi.fn((_request: GraphBadgeLinkInputRequest) => {});
    const { runtime } = engineFor(f, { onGraphLinkInputRequested: requestInput });
    const member = { id: "nested::member", sourcePath: f.clicked.path, embeddedInstanceId: "inner",
      embeddedDefinitionPath: "__nosygraph_lens__/scope", relationshipProperties: ["scope"] };
    runtime.nodeMap.set(member.id, member);
    runtime.nodeMap.set("inner-origin", { id: "inner-origin", sourcePath: lensSource, embeddedInstanceId: "outer" });
    runtime.embeddedGraphContainers.set("inner", {
      runtimeOnly: true, origin: "inner-origin", graphPath: "__nosygraph_lens__/scope",
      linkTypeId: enclosing.path, persistenceOwnerPath: "Outer.md", linkTypes: [lens, f.linkType]
    });
    await runtime.openBadgeLinkInput(member.id, f.linkType);
    expect(requestInput.mock.calls[0][0]).toMatchObject({
      write: { definitionId: f.linkType.definitionId, property: "relationship" },
      membership: {
        kind: "lens", ownerPath: lensSource, referencePath: f.clicked.path,
        instanceId: "inner", definitionId: enclosing.path,
        readProperties: ["scope", "deliverables"], provenance: ["scope"]
      }
    });
  });

  it("adds three clipboard notes through an outer Lens badge without writing graph roots", async () => {
    const f = fixture();
    const notes = [f.pasted, file("Folder/Second.md"), file("Folder/Third.md")];
    for (const note of notes) f.files.set(note.path, note);
    const processFrontMatter = vi.fn(async (note: TFile, edit: (frontmatter: Record<string, unknown>) => void) => {
      const next = { ...f.frontmatter.get(note.path) };
      edit(next);
      f.frontmatter.set(note.path, next);
    });
    Object.assign(f.app, { fileManager: {
      processFrontMatter,
      generateMarkdownLink: (note: TFile) => `[[${note.path}]]`
    } });
    const preference: BadgeMembershipPreferencePort = {
      get: () => ({ value: true, saving: false }),
      set: vi.fn(async () => {}),
      subscribe: () => () => {}
    };
    const target = { nodeId: f.clicked.path, path: f.clicked.path };
    const onMembershipCommitted = vi.fn();
    vi.spyOn(ObsidianGraphLinkInputHandler.prototype, "requestLinkInput").mockImplementation(function (this: unknown) {
      const input = this as {
        membership: unknown;
        submit(entries: BadgeInputEntry<TFile>[], origin: "clipboard-batch", option: BadgeMembershipOption): Promise<GraphBadgeInputResult>;
      };
      expect(input.membership).toBeNull();
      return input.submit(notes.map((note) => ({ path: note.path, file: note, relationshipComplete: false })), "clipboard-batch", {
        kind: "destination",
        destination: { ownerPath: f.graph.path, referencePath: f.clicked.path, property: "rootNodes" }
      });
    });
    const result = await requestGraphBadgeInput(f.app as unknown as App, {
      target,
      write: { target, property: "scope", semantic: "lens", discoveryDirection: "outgoing", definitionId: f.definition.path },
      membership: { kind: "note", ownerPath: f.graph.path, referencePath: f.clicked.path },
      isCurrent: () => true
    }, { preference, matchClipboard: () => undefined, onMembershipCommitted }, () => ({
      graphPropertyKeys: DEFAULT_GRAPH_PROPERTY_KEYS,
      defaultRootNodeProperties: [],
      linkTypePropertyKeys: DEFAULT_LINK_TYPE_PROPERTY_KEYS
    }));
    expect(result.added).toEqual(notes.map(({ path }) => path));
    expect(f.frontmatter.get(f.clicked.path)?.scope).toEqual(notes.map(({ path }) => `[[${path}]]`));
    expect(f.frontmatter.get(f.graph.path)?.rootNodes).toEqual(["[[Folder/Clicked]]"]);
    expect(processFrontMatter).toHaveBeenCalledExactlyOnceWith(f.clicked, expect.any(Function));
    expect(onMembershipCommitted).not.toHaveBeenCalled();
    expect(preference.set).not.toHaveBeenCalled();
  });

  it("updates changed incoming files and refreshes only matching expanded instances", () => {
    const f = fixture();
    const { engine, runtime } = engineFor(f);
    const nested = { id: "nested", sourcePath: f.clicked.path, embeddedInstanceId: "container" };
    runtime.nodes = [nested, { id: "outer", sourcePath: f.clicked.path }, { id: "collapsed", sourcePath: f.clicked.path }];
    runtime.activeNodeBadgeLinkTypes = [f.alternateType, f.linkType];
    runtime.embeddedGraphContainers.set("container", { linkTypes: [f.linkType] });
    runtime.expandedByBadge.set("nested::badge", {});
    runtime.expandedByBadge.set("outer::badge", {});
    const embeddedRefresh = vi.spyOn(runtime, "refreshEmbeddedBadgeExpansionAfterMutation").mockImplementation(() => {});
    const outerRefresh = vi.spyOn(runtime, "refreshBadgeExpansionAfterMutation").mockImplementation(() => {});
    const syncEdges = vi.spyOn(runtime, "syncVisibleLinkTypeEdgesAfterBadgeMutation").mockImplementation(() => {});
    const index = vi.spyOn(engine, "updateLinkDiscoveryIndexForFile").mockImplementation(() => {});
    const render = vi.spyOn(runtime, "requestRender").mockImplementation(() => {});
    vi.spyOn(engine, "reheatSimulation").mockImplementation(() => {});
    const visible = vi.spyOn(engine, "refreshVisibleLinkTypeEdgesForSourcePath").mockReturnValue(false);
    const embeddedVisible = vi.spyOn(engine, "refreshEmbeddedVisibleLinkTypeEdgesForSourcePath").mockReturnValue(false);
    const write = runtime.getBadgeLinkWriteDescriptor({ nodeId: nested.id, path: f.clicked.path }, f.linkType);
    const result = { added: [f.pasted.path], removed: [], skipped: [], changedFilePaths: [f.pasted.path] };
    engine.refreshAfterBadgeClipboardBatch(write, result);
    expect(index).toHaveBeenCalledExactlyOnceWith(f.pasted);
    expect(syncEdges).toHaveBeenCalledExactlyOnceWith(f.clicked.path, write.property, "incoming", result);
    expect(embeddedRefresh).toHaveBeenCalledExactlyOnceWith(nested, f.linkType, true);
    expect(outerRefresh).toHaveBeenCalledExactlyOnceWith("outer", f.clicked.path, "badge", true);
    expect(render).toHaveBeenCalledOnce();
    engine.reconcileBadgeClipboardMetadata(f.pasted);
    expect(visible).toHaveBeenCalledExactlyOnceWith(f.pasted.path, ["relationship"]);
    expect(embeddedVisible).toHaveBeenCalledExactlyOnceWith(f.pasted.path, ["relationship"]);
    engine.reconcileBadgeClipboardMetadata(f.pasted);
    expect(index).toHaveBeenCalledTimes(2);
    expect(embeddedRefresh).toHaveBeenCalledTimes(2);
  });

  it("retains viewport, surviving pinned positions and nested state on Lens refresh", () => {
    const f = fixture();
    const { engine, runtime } = engineFor(f);
    const container = { origin: "origin", linkTypeId: f.linkType.definitionId, ancestry: [],
      key: engine["embeddedGraphKey"]("origin", "runtime-lens") };
    runtime.nodeMap.set("origin", { id: "origin", sourcePath: f.clicked.path });
    runtime.embeddedGraphContainers.set(container.key, container);
    const previous = {
      lens: { lensWidth: 420, viewZoom: 0.75 },
      embeddedGraphs: [{ originNodeId: "survivor" }, { originNodeId: "removed" }],
      snapshots: [{ nodeId: "survivor", path: "Survivor.md", x: 32, y: 13, pinned: true, badges: { relation: "expanded" } }]
    };
    const fresh = {
      graphPath: "runtime-lens", runtimeOnly: true, linkTypeId: f.linkType.definitionId,
      snapshots: [
        { nodeId: "survivor", path: "Survivor.md", x: 80, y: 0, pinned: false, relationshipProperties: ["relationship"] },
        { nodeId: "new", path: "New.md", x: -80, y: 0, pinned: false }
      ]
    };
    type LensInternals = {
      refreshOpenLensContainer(container: object): boolean;
      findRuntimeLinkTypeById(): unknown;
      getEmbeddedGraphDefinitionForContainer(): unknown;
      buildLensEmbeddedGraphDefinition(): unknown;
      notifyEmbeddedGraphLensChanged(): void;
    };
    const internals = engine as unknown as LensInternals;
    vi.spyOn(internals, "findRuntimeLinkTypeById").mockReturnValue(f.linkType);
    vi.spyOn(internals, "getEmbeddedGraphDefinitionForContainer").mockReturnValue(previous);
    vi.spyOn(internals, "buildLensEmbeddedGraphDefinition").mockReturnValue(fresh);
    vi.spyOn(internals, "notifyEmbeddedGraphLensChanged").mockImplementation(() => {});
    vi.spyOn(engine, "collapseEmbeddedGraph").mockReturnValue(true);
    const expand = vi.spyOn(engine, "expandEmbeddedGraph").mockReturnValue(true);
    expect(internals.refreshOpenLensContainer(container)).toBe(true);
    expect(expand).toHaveBeenCalledWith("origin", expect.objectContaining({
      lens: previous.lens, embeddedGraphs: [previous.embeddedGraphs[0]],
      snapshots: [{ ...fresh.snapshots[0], ...previous.snapshots[0] }, fresh.snapshots[1]]
    }));
  });

  it("uses one session association and broadcasts committed paths through the main view and mounted embed", async () => {
    const f = fixture();
    const hostElement = { style: { setProperty() {} }, getBoundingClientRect: () => ({ width: 600, height: 400 }) };
    const container = { empty() {}, createDiv: () => hostElement };
    vi.stubGlobal("window", { setTimeout: vi.fn(), clearTimeout: vi.fn() });
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.spyOn(GraphEngine.prototype, "init").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "setBadgeFarViewThreshold").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "setActiveLinkTypes").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "setSelectedLinkTypes").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "setHideNodesWithoutSelectedLinkTypes").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "updateGraph").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "handleResize").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "centerViewportOnGravityCenter").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "reheatSimulation").mockImplementation(() => {});
    vi.spyOn(GraphEngine.prototype, "getNodeCount").mockReturnValue(1);
    const engineRefresh = vi.spyOn(GraphEngine.prototype, "refreshAfterBadgeClipboardBatch").mockImplementation(() => {});
    interface Embed {
      mountAsync(): Promise<void>;
      engine: EngineInternals;
      cleanups: Array<() => void>;
    }
    const plugin = new BasesGraphPlugin(f.app as unknown as App, {} as never);
    Object.assign(plugin, { settings: {
      graphPropertyKeys: DEFAULT_GRAPH_PROPERTY_KEYS, noteTypeIdentifiers: DEFAULT_NOTE_TYPE_IDENTIFIERS,
      linkTypePropertyKeys: DEFAULT_LINK_TYPE_PROPERTY_KEYS, linkTypeFolder: "Definitions/",
      badgeInputAddToMembership: true,
      defaultRootNodeProperties: [], defaultVisibleLinkTypes: [], defaultSourceLimit: 100, defaultNodeLimit: 100
    } });
    const ports = plugin as unknown as {
      graphNodeClipboard: { remember(paths: string[], text: string): void; match: MatchGraphNodeClipboard };
      refreshAfterBadgeClipboardBatch: GraphBadgeBatchCommitted;
      getBadgeInputIntegration(): GraphBadgeInputIntegration;
      createRenderedGraphEmbed(container: unknown, file: TFile): Embed;
    };
    const text = "[Pasted](./Pasted.md)";
    ports.graphNodeClipboard.remember([f.pasted.path], text);
    const mainView = new BasesGraphView({ app: f.app, containerEl: container } as unknown as WorkspaceLeaf);
    Object.assign(mainView, { badgeInput: ports.getBadgeInputIntegration() });
    f.app.workspace.getLeavesOfType.mockReturnValue([{ view: mainView }]);
    const embed = ports.createRenderedGraphEmbed(container, f.graph);
    await embed.mountAsync();
    const main = mainView as unknown as { engine: EngineInternals };
    const target = { nodeId: "clicked", path: f.clicked.path };
    const write = main.engine.getBadgeLinkWriteDescriptor(target, f.linkType);
    const request: GraphBadgeLinkInputRequest = { target, write, membership: { kind: "note", ownerPath: f.graph.path, referencePath: f.clicked.path }, isCurrent: () => true };
    const matches = vi.fn();
    const mutation = { origin: "clipboard-batch" as const, added: [f.pasted.path], removed: [], skipped: [], changedFilePaths: [f.pasted.path] };
    vi.spyOn(ObsidianGraphLinkMutationHandler.prototype, "applyBadgeLinkAdd").mockResolvedValue(mutation);
    const input = vi.spyOn(ObsidianGraphLinkInputHandler.prototype, "requestLinkInput").mockImplementation(async function (this: unknown) {
      const adapter = this as {
        matchClipboard: MatchGraphNodeClipboard;
        preference: BadgeMembershipPreferencePort;
        submit(entries: BadgeInputEntry<TFile>[], origin: "clipboard-batch", membership: BadgeMembershipOption): Promise<GraphBadgeInputResult>;
      };
      matches(adapter.matchClipboard(text));
      expect(adapter.preference).toBe(plugin.badgeMembershipPreference);
      return adapter.submit([{ path: f.pasted.path, file: f.pasted, relationshipComplete: false }], "clipboard-batch", { kind: "off" });
    });
    for (const activeEngine of [main.engine, embed.engine]) {
      await expect(activeEngine.menuOptions.onGraphLinkInputRequested?.(request)).resolves.toMatchObject(mutation);
    }
    expect(input).toHaveBeenCalledTimes(2);
    expect(matches.mock.calls).toEqual([[[f.pasted.path]], [[f.pasted.path]]]);
    expect(engineRefresh.mock.instances).toEqual([main.engine, embed.engine, main.engine, embed.engine]);
    expect(engineRefresh).toHaveBeenCalledWith(write, expect.objectContaining(mutation));
    for (const cleanup of embed.cleanups) cleanup();
    ports.refreshAfterBadgeClipboardBatch(write, mutation);
    expect(engineRefresh.mock.instances.at(-1)).toBe(main.engine);
    expect(engineRefresh).toHaveBeenCalledTimes(5);
  });
});
