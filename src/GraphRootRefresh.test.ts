import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

vi.mock("obsidian", () => ({
  FileView: class {}, Modal: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, Menu: class {}, Notice: class {}
}));

import { BasesGraphView } from "./GraphView";
import { DEFAULT_GRAPH_PROPERTY_KEYS } from "./GraphPropertyKeys";
import { DEFAULT_NOTE_TYPE_IDENTIFIERS } from "./NoteTypeIdentifier";
import { O3GraphState, type O3GraphRuntimeNodeSnapshot } from "./O3GraphState";

function snapshot(path: string, x = 20): O3GraphRuntimeNodeSnapshot {
  return { nodeId: path, path, x, y: 40, pinned: true, origin: { kind: "root" }, badges: { related: "expanded" } };
}

function fixture(defaults = false) {
  const graph = Object.assign(new TFile(), { path: "Lens.md", basename: "Lens", extension: "md" });
  const a = Object.assign(new TFile(), { path: "A.md", basename: "A" });
  const b = Object.assign(new TFile(), { path: "B.md", basename: "B" });
  const frontmatter: Record<string, unknown> = {
    ...(defaults ? {} : { rootNodeProperties: ["members"] }),
    Members: ["[[A]]", "[[B]]"]
  };
  const state = new O3GraphState(graph);
  state.migrateToCurrentLayout([snapshot(a.path)]);
  const files = [graph, a, b];
  const view = Object.assign(Object.create(BasesGraphView.prototype), {
    file: graph, initialized: true,
    graphPropertyKeys: DEFAULT_GRAPH_PROPERTY_KEYS,
    noteTypeIdentifiers: DEFAULT_NOTE_TYPE_IDENTIFIERS,
    defaultRootNodeProperties: defaults ? ["members"] : [],
    fileModeRootFiles: [a],
    embeddedGraphStates: new Map([[graph.path, state]]),
    embeddedGraphDocumentStores: new Map([[graph.path, {}]]),
    suppressGraphFileReloadUntil: Date.now() + 2000,
    suppressEmbeddedGraphReloadUntil: new Map([[graph.path, Date.now() + 2000]]),
    readGraphFrontmatterFromDisk: vi.fn(async () => frontmatter),
    loadReferencedLinkTypesFromGraphFrontmatter: vi.fn(async () => {}),
    resolveActiveLinkTypesFromYaml: vi.fn(async () => []),
    resolveVisibleLinkTypesFromYamlWithDefaults: vi.fn(() => []),
    getVisibleLinkTypeDefinitionsForProperties: vi.fn(() => []),
    evaluateGrouping: vi.fn(() => null),
    app: {
      vault: { getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) },
      metadataCache: {
        getFileCache: () => ({ frontmatter }),
        getFirstLinkpathDest: (path: string) => files.find((file) => file.path === path || file.basename === path)
      }
    }
  });
  return { view, graph, a, b, state, frontmatter };
}

describe("configured root links refresh open graphs and lenses", () => {
  it.each([false, true])("includes added YAML roots despite persisted Lens nodes (defaults=%s)", async (defaults) => {
    const { view, graph, a, b } = fixture(defaults);
    view.file = { path: "Parent.md" };
    const definition = await view.loadEmbeddedGraphDefinition(graph.path, []);
    expect(definition.snapshots.map((node: O3GraphRuntimeNodeSnapshot) => node.path)).toEqual([a.path, b.path]);
    expect(definition.snapshots[0]).toEqual(snapshot(a.path));
  });

  it.each([false, true])("refreshes each open Lens instance without losing its layout (defaults=%s)", async (defaults) => {
    const { view, graph, a, b } = fixture(defaults);
    view.file = { path: "Parent.md" };
    // Reloading the document still returns the old saved layout; YAML must supply B.
    const state = new O3GraphState(graph);
    state.migrateToCurrentLayout([snapshot(a.path)]);
    view.loadEmbeddedGraphDefinition = vi.fn(async () => {
      view.embeddedGraphStates.set(graph.path, state);
      return { graphPath: graph.path, snapshots: [snapshot(a.path), snapshot(b.path)] };
    });
    view.engine = {
      getEmbeddedGraphInstances: () => [
        { instanceId: "one", originNodeId: "Origin1", ancestry: [], persistenceOwnerPath: "Parent.md" },
        { instanceId: "two", originNodeId: "Origin2", ancestry: [], persistenceOwnerPath: "Parent.md" }
      ],
      getEmbeddedGraphSnapshotsForInstance: (id: string) => [snapshot(a.path, id === "one" ? 111 : 222)],
      replaceEmbeddedGraphInstance: vi.fn(() => true)
    };
    await view.refreshEmbeddedGraphDocument(graph);
    const calls = view.engine.replaceEmbeddedGraphInstance.mock.calls;
    expect(calls).toHaveLength(2);
    for (const [index, [, definition]] of calls.entries()) {
      expect(definition.snapshots.map((node: O3GraphRuntimeNodeSnapshot) => node.path)).toEqual([a.path, b.path]);
      expect(definition.snapshots[0]).toEqual(snapshot(a.path, index === 0 ? 111 : 222));
    }
  });

  it.each([false, true])("processes root edits during graph-state write suppression (defaults=%s)", async (defaults) => {
    const { view, graph, a, b } = fixture(defaults);
    view.reloadFromFile = vi.fn(async () => {});
    expect(view.shouldSuppressEmbeddedGraphReload(graph)).toBe(false);
    await view.handleGraphEvent({ type: "GRAPH_FILE_CHANGED", path: graph.path });
    expect(view.reloadFromFile).toHaveBeenCalledTimes(1);
    view.fileModeRootFiles = [a, b];
    await view.handleGraphEvent({ type: "GRAPH_FILE_CHANGED", path: graph.path });
    expect(view.reloadFromFile).toHaveBeenCalledTimes(1);
    view.embeddedGraphStates.get(graph.path).migrateToCurrentLayout([snapshot(a.path), snapshot(b.path)]);
    expect(view.shouldSuppressEmbeddedGraphReload(graph)).toBe(true);
  });

  it("uses an explicit root-property list instead of defaults", () => {
    const { view, graph, a, frontmatter } = fixture(true);
    frontmatter.rootNodeProperties = ["other"];
    frontmatter.other = ["[[A]]"];
    expect(view.shouldSuppressGraphFileReload(graph)).toBe(true);
    expect(view.haveConfiguredRootNodesChanged(graph, [a.path])).toBe(false);
  });

  it("restores saved Lens layouts with newly configured roots", async () => {
    const { view, a, b } = fixture();
    view.graphState = {
      listExpandedEmbeddedGraphs: () => [{
        originNodeId: "Origin", graphPath: "Lens.md", snapshots: [snapshot(a.path, 123)],
        lens: { lensWidth: 500 }
      }]
    };
    view.loadEmbeddedGraphDefinition = vi.fn(async () => ({ snapshots: [snapshot(a.path), snapshot(b.path)] }));
    view.engine = { isEmbeddedGraphExpanded: () => false, expandEmbeddedGraph: vi.fn(), applyEmbeddedGraphLensState: vi.fn() };
    await view.restoreEmbeddedGraphExpansions();
    const definition = view.engine.expandEmbeddedGraph.mock.calls[0][1];
    expect(definition.snapshots).toEqual([snapshot(a.path, 123), snapshot(b.path)]);
    expect(definition.lens).toEqual({ lensWidth: 500 });
  });

  it("promotes an existing expansion to a configured root and preserves its badges", () => {
    const { view, a, b } = fixture();
    const expanded = { ...snapshot(a.path), origin: { kind: "expansion", sourceNodeId: b.path, linkType: "related" } };
    expect(view.mergeConfiguredRootSnapshots([expanded], [snapshot(a.path)])).toEqual([snapshot(a.path)]);
  });
});
