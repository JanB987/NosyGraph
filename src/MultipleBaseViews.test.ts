import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";

vi.mock("obsidian", () => ({
  TFile: class {}, TFolder: class {}, FileView: class {}, Modal: class {}, Component: class {}, Menu: class {}, Notice: class {},
  parseYaml: (content: string) => JSON.parse(content)
}));

import { ObsidianBaseViewFilterResolver } from "./ObsidianBaseViewFilterResolver";
import { BasesGraphView } from "./GraphView";
import { O3GraphDependencyWatcher } from "./O3GraphDependencyWatcher";
import { DEFAULT_GRAPH_PROPERTY_KEYS } from "./GraphPropertyKeys";

function fixture() {
  const file = (path: string, frontmatter: Record<string, unknown> = {}) => Object.assign(new TFile(), {
    path, basename: path.replace(/\.[^.]+$/, ""), name: path, extension: path.split(".").pop(), frontmatter
  });
  const notes = [
    file("A.md", { include: true, kind: "graph", status: "open" }),
    file("B.md", { include: true, kind: "graph", status: "waiting" }),
    file("C.md", { include: true, kind: "task", status: "waiting" }),
    file("D.md", { include: false, kind: "task", status: "waiting" })
  ];
  const first = file("Graphs.base");
  const second = file("Tasks.base");
  const graph = file("Graph.md", { connected_base_filter: ["[[Graphs.base#Graphs]]", "[[Tasks.base#waiting]]"] });
  const root = file("Root.md");
  const files = [first, second, graph, root, ...notes];
  const documents = new Map<string, Record<string, unknown>>([
    [first.path, { filters: 'include == true', views: [
      { name: "Graphs", filters: 'kind == "graph"' },
      { name: "Tasks", filters: 'status == "waiting"' },
      { name: "Empty", filters: false },
      { name: "Unsupported", filters: 'unsupportedFunction()' }
    ] }],
    [second.path, { filters: 'include == true', views: [{ name: "waiting", filters: 'status == "waiting"' }] }]
  ]);
  const read = vi.fn(async (target: TFile) => {
    const definition = documents.get(target.path);
    if (!definition) throw new Error("Base read failed");
    return JSON.stringify(definition);
  });
  const app = {
    vault: {
      read, getFiles: () => files, getMarkdownFiles: () => notes,
      getAbstractFileByPath: (path: string) => files.find((candidate) => candidate.path === path) ?? null
    },
    metadataCache: {
      getFileCache: (target: TFile) => ({ frontmatter: (target as typeof graph).frontmatter }),
      getFirstLinkpathDest: (path: string) => files.find((candidate) => candidate.path === path) ?? null
    }
  } as unknown as App;
  const resolver = new ObsidianBaseViewFilterResolver(app);
  const paths = (result: { files: TFile[] }) => result.files.map((candidate) => candidate.path);
  return { app, resolver, paths, notes, first, second, graph, root, documents, read };
}

describe("multiple connected Base views", () => {
  it("unions different Bases in list order without duplicate notes", async () => {
    const { resolver, graph, paths } = fixture();
    const result = await resolver.resolveAll(graph.frontmatter.connected_base_filter, graph);
    expect(paths(result)).toEqual(["A.md", "B.md", "C.md"]);
    expect(result.baseFiles.map((file) => file.path)).toEqual(["Graphs.base", "Tasks.base"]);
    expect(result.results).toHaveLength(2);
  });

  it("supports multiple views of one Base and reads that Base only once", async () => {
    const { resolver, graph, paths, read } = fixture();
    const result = await resolver.resolveAll(["[[Graphs.base#Graphs]]", "[[Graphs.base#Tasks]]"], graph);
    expect(paths(result)).toEqual(["A.md", "B.md", "C.md"]);
    expect(result.baseFiles).toHaveLength(1);
    expect(result.results).toHaveLength(2);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("preserves scalar, singleton-list, and empty configurations", async () => {
    const { resolver, graph, paths } = fixture();
    const scalar = await resolver.resolveAll("[[Graphs.base#Graphs]]", graph);
    const list = await resolver.resolveAll(["[[Graphs.base#Graphs]]"], graph);
    expect(paths(scalar)).toEqual(["A.md", "B.md"]);
    expect(list).toEqual(scalar);
    expect(await resolver.resolveAll([], graph)).toMatchObject({ files: [], baseFiles: [], results: [], filterId: null, source: "none" });
  });

  it("deduplicates repeated view references including display aliases and view-name casing", async () => {
    const { resolver, graph, read } = fixture();
    const result = await resolver.resolveAll(["[[Graphs.base#Graphs]]", "[[Graphs.base#graphs|My view]]"], graph);
    expect(result.results).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each(["[[Missing.base#Test]]", "[[Graphs.base#Missing]]", "[[Graphs.base#Unsupported]]", "[[Graphs.base#Empty]]"])("retains valid results alongside %s", async (reference) => {
    const { resolver, graph, paths } = fixture();
    const result = await resolver.resolveAll([reference, "[[Tasks.base#waiting]]"], graph);
    expect(paths(result)).toEqual(["B.md", "C.md"]);
    expect(result.results[0].status).toBe(reference.includes("#Empty") ? "resolved"
      : reference.includes("#Unsupported") ? "filter-unsupported"
      : reference.includes("#Missing") ? "view-unresolved" : "base-unresolved");
  });

  it("isolates read errors to the failing connection", async () => {
    const { resolver, graph, paths, documents, first } = fixture();
    documents.delete(first.path);
    const result = await resolver.resolveAll(graph.frontmatter.connected_base_filter, graph);
    expect(paths(result)).toEqual(["B.md", "C.md"]);
    expect(result.results[0]).toMatchObject({ status: "base-unreadable", baseFile: first });
    expect(result.results[0].message).toContain("Base read failed");
  });

  it("applies each view's own limit before forming the union", async () => {
    const { resolver, graph, paths, documents, first, second } = fixture();
    documents.set(first.path, { views: [{ name: "Graphs", filters: 'kind == "graph"', limit: 1 }] });
    documents.set(second.path, { views: [{ name: "waiting", filters: 'status == "waiting"', limit: 1 }] });
    expect(paths(await resolver.resolveAll(graph.frontmatter.connected_base_filter, graph))).toEqual(["A.md", "B.md"]);
  });

  it("watches both Bases and refreshes the union when the second changes or is disconnected", async () => {
    const { app, resolver, graph, root, documents, second, paths } = fixture();
    const watcher = new O3GraphDependencyWatcher();
    const view = Object.assign(Object.create(BasesGraphView.prototype), {
      app, file: graph, isFileMode: true, graphPropertyKeys: DEFAULT_GRAPH_PROPERTY_KEYS,
      baseViewFilterResolver: resolver, connectedBaseFilterResult: null,
      fileModeRootFiles: [root], fileModeFilterFiles: [], currentGraphFiles: [],
      globalLinkTypeRegistry: { getAll: () => [], getByPath: () => undefined }, activeGroups: [], activeLinkTypes: [], activeOverlayLinkTypes: [],
      noteTypeIdentifiers: { linkType: { property: "o3LinkType", value: "true" } },
      visibleLinkTypes: [], linkTypeFolder: "", dependencyWatcher: watcher,
      lastConnectedBaseFilterMessage: null, rebuildGraph: vi.fn()
    });
    expect(await view.refreshConnectedBaseFilterFiles()).toBe(true);
    expect(view.currentGraphFiles.map((file: TFile) => file.path)).toEqual(["Root.md", "A.md", "B.md", "C.md"]);
    expect(watcher.isWatched("Graphs.base")).toBe(true);
    expect(watcher.isWatched("Tasks.base")).toBe(true);
    expect(view.isRelevantMetadataChangeFile(second)).toBe(true);
    expect(watcher.emitGraphEvents(second, app.metadataCache)).toEqual([{ type: "BASE_FILTER_CHANGED", path: second.path }]);

    documents.set(second.path, { views: [{ name: "waiting", filters: 'file.name == "B"' }] });
    await view.handleConnectedBaseFilterModify(second);
    expect(paths(view.connectedBaseFilterResult)).toEqual(["A.md", "B.md"]);
    expect(view.rebuildGraph).toHaveBeenCalledTimes(1);
    documents.set(second.path, { filters: 'include == true', views: [{ name: "waiting", filters: 'status == "waiting"' }] });
    await view.refreshConnectedBaseFilterFiles();
    expect(paths(view.connectedBaseFilterResult)).toEqual(["A.md", "B.md", "C.md"]);
    graph.frontmatter.connected_base_filter = ["[[Graphs.base#Graphs]]"];
    await view.refreshConnectedBaseFilterFiles();
    expect(watcher.isWatched("Tasks.base")).toBe(false);
    expect(view.currentGraphFiles.map((file: TFile) => file.path)).toEqual(["Root.md", "A.md", "B.md"]);
    view.scheduleGraphHydration = vi.fn();
    await view.handleVaultRename(second, "PreviousTasks.base");
    expect(view.scheduleGraphHydration).toHaveBeenCalledExactlyOnceWith("connected-base-rename", 150);
  });
});
