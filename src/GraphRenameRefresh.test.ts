import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";

vi.mock("obsidian", () => ({
  FileView: class {}, Modal: class {}, Component: class {}, TFile: class {},
  TFolder: class {}, Menu: class {}, Notice: class {},
  parseYaml: (value: string) => JSON.parse(value),
  stringifyYaml: (value: unknown) => JSON.stringify(value, null, 2)
}));

import { BasesGraphView } from "./GraphView";
import { DEFAULT_GRAPH_PROPERTY_KEYS } from "./GraphPropertyKeys";
import { renameRootLinkValue, type RootLinkRename } from "./GraphRootLinkRename";
import { O3GraphState } from "./O3GraphState";
import { O3GraphStateStore } from "./O3GraphStateStore";

const options: RootLinkRename = {
  oldPath: "Notes/Old title.md", newPath: "Notes/New title.md", sourcePath: "Graphs/Graph.md",
  resolveLinkpath: () => null
};

describe("root links after a file rename", () => {
  it.each([
    ["[[Notes/Old title]]", "[[Notes/New title]]"],
    ["[[Old title]]", "[[Notes/New title]]"],
    ["[[Notes/Old title.md#Section|A label]]", "[[Notes/New title.md#Section|A label]]"],
    ["[Read this](../Notes/Old%20title.md#Section)", "[Read this](../Notes/New%20title.md#Section)"],
    ["[Read this](Notes/Old%20title.md)", "[Read this](../Notes/New%20title.md)"],
    ["Notes/Old title.md", "Notes/New title.md"],
    ["[[Old title]], [[Other]]", "[[Notes/New title]], [[Other]]"],
    ["[[Other]]", "[[Other]]"],
    ["https://example.com/Notes/Old%20title.md", "https://example.com/Notes/Old%20title.md"]
  ])("renames %s without losing link format or subpaths", (before, after) => {
    expect(renameRootLinkValue(before, options)).toBe(after);
  });

  it("does not change a short link that resolves to a different existing note", () => {
    const resolveLinkpath = vi.fn(() => "Other/Old title.md");
    expect(renameRootLinkValue("[[Old title]]", { ...options, resolveLinkpath })).toBe("[[Old title]]");
    expect(resolveLinkpath).toHaveBeenCalledWith("Old title", "Graphs/Graph.md");
  });

  it("keeps a same-folder short link attached to the renamed note", () => {
    expect(renameRootLinkValue("[[Old title]]", {
      ...options, sourcePath: "Notes/Graph.md", resolveLinkpath: () => "Other/Old title.md"
    })).toBe("[[Notes/New title]]");
  });

  it("does not mistake an explicitly relative link in another folder for the renamed note", () => {
    expect(renameRootLinkValue("[Old](./Old%20title.md)", options)).toBe("[Old](./Old%20title.md)");
  });

  it("updates relative Markdown links when the note moves to another folder", () => {
    expect(renameRootLinkValue("[Alias](../Notes/Old%20title.md#Section)", {
      ...options, newPath: "Archive/New title.md"
    })).toBe("[Alias](../Archive/New%20title.md#Section)");
  });

  it("handles case-only title changes", () => {
    expect(renameRootLinkValue("[[Notes/Old title]]", {
      ...options, newPath: "Notes/old title.md"
    })).toBe("[[Notes/old title]]");
  });

  it("preserves nonstring YAML values and list shape", () => {
    expect(renameRootLinkValue(["[[Old title]]", false, null, { value: "[[Old title]]" }], options))
      .toEqual(["[[Notes/New title]]", false, null, { value: "[[Old title]]" }]);
  });

  it("is a no-op after Obsidian has already updated the link", () => {
    expect(renameRootLinkValue("[[Notes/New title]]", options)).toBe("[[Notes/New title]]");
  });
});

function fixture(frontmatter: Record<string, unknown>, defaults: string[] = []) {
  const graph = Object.assign(new TFile(), { path: "Graphs/Graph.md", extension: "md" });
  const renamed = Object.assign(new TFile(), { path: options.newPath, extension: "md" });
  let content = "---\n" + JSON.stringify(frontmatter) + "\n---\n# Keep this body\n";
  const process = vi.fn(async (_file: TFile, transform: (value: string) => string) => {
    content = transform(content);
    return content;
  });
  const view = Object.assign(Object.create(BasesGraphView.prototype), {
    file: graph, graphPropertyKeys: DEFAULT_GRAPH_PROPERTY_KEYS, defaultRootNodeProperties: defaults,
    suppressEmbeddedGraphReloadUntil: new Map(),
    app: { vault: { process }, metadataCache: { getFirstLinkpathDest: () => null } }
  });
  return { view, graph, renamed, process, content: () => content,
    frontmatter: () => view.parseFrontmatter(content).frontmatter as Record<string, unknown>,
    setContent: (next: string) => { content = next; } };
}

describe("graph-note root-property rename integration", () => {
  it.each([false, true])("updates configured root properties (defaults=%s)", async (defaults) => {
    const f = fixture({ ...(defaults ? {} : { rootNodeProperties: ["parts", "related"] }),
      Parts: ["[[Old title]]", "[[Other]]"], related: "[[Notes/Old title#Section|Alias]]", untouched: "[[Old title]]"
    }, defaults ? ["parts", "related"] : []);
    expect(await f.view.updateGraphRootNodesForRenamedPath(f.graph, options.oldPath, f.renamed)).toBe(true);
    expect(f.frontmatter()).toMatchObject({
      Parts: ["[[Notes/New title]]", "[[Other]]"], related: "[[Notes/New title#Section|Alias]]", untouched: "[[Old title]]"
    });
    expect(f.content()).toContain("# Keep this body\n");
  });

  it("uses an explicit list instead of default properties, including an empty list", async () => {
    for (const rootNodeProperties of [[], ["related"]]) {
      const f = fixture({ rootNodeProperties, parts: ["[[Old title]]"] }, ["parts"]);
      expect(await f.view.updateGraphRootNodesForRenamedPath(f.graph, options.oldPath, f.renamed)).toBe(false);
      expect(f.frontmatter().parts).toEqual(["[[Old title]]"]);
    }
  });

  it("retains legacy and custom property-key support without changing YAML key casing", async () => {
    const f = fixture({ ROOTS: ["[[Notes/Old title]]"], RootSources: ["parts"], parts: "[[Old title]]" });
    f.view.graphPropertyKeys = { ...DEFAULT_GRAPH_PROPERTY_KEYS, rootNodes: "roots", rootNodeProperties: "rootSources" };
    expect(await f.view.updateGraphRootNodesForRenamedPath(f.graph, options.oldPath, f.renamed)).toBe(true);
    expect(f.frontmatter()).toEqual({ ROOTS: ["[[Notes/New title]]"], RootSources: ["parts"], parts: "[[Notes/New title]]" });
  });

  it("uses the latest document and leaves an already updated property alone", async () => {
    const f = fixture({ rootNodeProperties: ["parts"], parts: ["[[Old title]]"] });
    f.process.mockImplementationOnce(async (_file, transform) => {
      const nativeUpdate = f.content().replace("[[Old title]]", "[[Notes/New title]]") + "Concurrent body edit\n";
      const next = transform(nativeUpdate);
      f.setContent(next);
      return next;
    });
    expect(await f.view.updateGraphRootNodesForRenamedPath(f.graph, options.oldPath, f.renamed)).toBe(false);
    expect(f.frontmatter().parts).toEqual(["[[Notes/New title]]"]);
    expect(f.content()).toContain("Concurrent body edit");
  });
});

describe("atomic graph-state writes during rename", () => {
  it("preserves native link and body edits present when the atomic write executes", async () => {
    const graph = Object.assign(new TFile(), { path: "Graph.md" });
    let content = '---\n{"parts":["[[Old title]]"]}\n---\n# Graph\n';
    const read = vi.fn(async () => content);
    const modify = vi.fn();
    const process = vi.fn(async (_file: TFile, transform: (value: string) => string) => {
      content = content.replace("[[Old title]]", "[[New title]]") + "Concurrent edit\n";
      content = transform(content);
      return content;
    });
    const store = new O3GraphStateStore({ vault: { process, read, modify } } as unknown as App, graph);
    const state = new O3GraphState(graph);
    state.migrateToCurrentLayout([{ nodeId: "New title.md", path: "New title.md", x: 12, y: 34,
      pinned: true, origin: { kind: "root" }, badges: { parts: "expanded" } }]);
    expect(await store.write(state)).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(modify).not.toHaveBeenCalled();
    expect(content).toContain('"[[New title]]"');
    expect(content).toContain("Concurrent edit");
    const reopened = new O3GraphState(graph);
    reopened.loadFromContent(content);
    expect(reopened.toRuntimeNodeSnapshots()).toEqual(state.toRuntimeNodeSnapshots());
  });

  it("does not invoke a modifying operation when the graph state is unchanged", async () => {
    const graph = { path: "Graph.md" } as TFile;
    let content = "# Graph\n";
    const process = vi.fn(async (_file: TFile, transform: (value: string) => string) => {
      content = transform(content);
      return content;
    });
    const store = new O3GraphStateStore({ vault: { read: async () => content, process } } as unknown as App, graph);
    const state = new O3GraphState(graph);
    expect(await store.write(state)).toBe(true);
    process.mockClear();
    expect(await store.write(state)).toBe(false);
    expect(process).not.toHaveBeenCalled();
  });

  it("keeps the existing protection against overwriting empty documents", async () => {
    const graph = { path: "Graph.md" } as TFile;
    let content = "";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const store = new O3GraphStateStore({ vault: {
        read: async () => content,
        process: async (_file: TFile, transform: (value: string) => string) => { content = transform(content); return content; }
      } } as unknown as App, graph);
      expect(await store.write(new O3GraphState(graph))).toBe(false);
      expect(content).toBe("");
      expect(warning).toHaveBeenCalled();
    } finally { warning.mockRestore(); }
  });
});
