import { afterEach, describe, expect, it, vi } from "vitest";
const { notices } = vi.hoisted(() => ({ notices: [] as string[] }));
vi.mock("obsidian", () => ({
  TFile: class {}, Notice: class { constructor(message: string) { notices.push(message); } },
  parseYaml: (value: string) => JSON.parse(value)
}));
import { TFile } from "obsidian";
import { DEFAULT_GRAPH_PROPERTY_KEYS } from "./GraphPropertyKeys";
import { DEFAULT_LINK_TYPE_PROPERTY_KEYS } from "./NoteTypePropertyKeys";
import { inspectMembershipReference } from "./GraphRootMembership";
import { GraphNodeClipboardState, publishGraphNodeLinks } from "./GraphNodeClipboard";
import { ObsidianGraphNodeCutHost, type GraphCutSurface } from "./ObsidianGraphNodeCutHost";
import { cutGraphNodes, type GraphCutReference, type GraphCutDefinition, type GraphNodeCutSelection } from "./graph-application/GraphNodeCutService";

const root = (ownerPath: string, path = "A.md", nodeId = path): GraphNodeCutSelection =>
  ({ nodeId, path, origin: { kind: "graph-membership", ownerPath } });
const definition = (definitionId: string, readProperties: string[], direction: GraphCutDefinition["direction"] = "outgoing",
  semantic: GraphCutDefinition["semantic"] = "link"): GraphCutDefinition => ({ definitionId, readProperties, direction, semantic });
const lens = (ownerPath: string, path: string, def: GraphCutDefinition, nodeId = path): GraphNodeCutSelection =>
  ({ nodeId, path, origin: { kind: "lens-membership", ownerPath, definition: def, provenance: [] } });
const expansion = (sourcePath: string, path: string, ...definitions: GraphCutDefinition[]): GraphNodeCutSelection =>
  ({ nodeId: `expanded-${path}`, path, origin: { kind: "relationship-expansion", unavailable: [],
    owners: definitions.map((def, index) => ({ sourceNodeId: sourcePath, sourcePath, expansionId: String(index), definition: def }))
  } });

function fixture(initial: Record<string, Record<string, unknown>>, selection: GraphNodeCutSelection[], defaults: string[] = []) {
  const docs = structuredClone(initial);
  const files = new Map(Object.keys(docs).map(path => [path,
    Object.assign(new TFile(), { path, basename: path.split("/").at(-1)?.replace(/\.md$/, ""), extension: "md" })
  ]));
  const events: string[] = [];
  const write = vi.fn(async (_text: string) => { events.push("clipboard"); });
  vi.stubGlobal("navigator", { clipboard: { writeText: write } });
  const processFrontMatter = vi.fn(async (file: TFile, mutate: (fm: Record<string, unknown>) => void) => {
    events.push(file.path);
    mutate(docs[file.path]);
  });
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path),
      read: async (file: TFile) => `---\n${JSON.stringify(docs[file.path])}\n---\nUntouched body`
    },
    metadataCache: {
      getFileCache: () => null,
      getFirstLinkpathDest: (ref: string, owner: string) => {
        const path = ref.startsWith("./") ? `${owner.slice(0, owner.lastIndexOf("/") + 1)}${ref.slice(2)}` : ref;
        return files.get(/\.md$/i.test(path) ? path : `${path}.md`);
      }
    },
    fileManager: { processFrontMatter, generateMarkdownLink: (file: TFile) => `[[${file.path.replace(/\.md$/, "")}]]` }
  };
  const clipboard = new GraphNodeClipboardState();
  const surface = (focus = false) => ({
    getCutSource: () => files.values().next().value ?? null,
    getCutSelection: () => selection,
    hasCutFocus: () => focus,
    copySelectedNodeLinksToClipboard: vi.fn(async () => {}),
    refreshAfterCut: vi.fn(async () => { events.push(focus ? "refresh view" : "refresh embed"); }),
    persistAfterCut: vi.fn(async (_changes, savedOwners: Set<string>) => {
      for (const path of files.keys()) savedOwners.add(path);
      events.push(focus ? "persist view" : "persist embed");
    })
  } satisfies GraphCutSurface);
  const view = surface(true);
  const embed = surface();
  const surfaces: GraphCutSurface[] = [view, embed];
  const host = new ObsidianGraphNodeCutHost(app as never,
    () => ({ graphPropertyKeys: DEFAULT_GRAPH_PROPERTY_KEYS, defaultRootNodeProperties: defaults, linkTypePropertyKeys: DEFAULT_LINK_TYPE_PROPERTY_KEYS }),
    () => surfaces,
    (paths, text) => clipboard.remember(paths, text));
  return { docs, files, host, view, embed, write, processFrontMatter, clipboard, events, surfaces };
}

afterEach(() => {
  notices.length = 0;
  vi.unstubAllGlobals();
});

describe("property reference edits", () => {
  it.each(["prefix [[A]] suffix", "[[A]] [[B]]", { path: "A", label: "retain" }])("recognizes ambiguous compound values", compound => {
    expect(inspectMembershipReference(["[[A]]", compound, "[[B]]"], "A.md", path => `${path}.md`))
      .toMatchObject({ matches: true, ambiguous: true });
  });

  it("removes aliases, headings, relative links, and missing-note links while preserving types, order, and key casing", async () => {
    const f = fixture({
      "Folder/Owner.md": { rootNodeProperties: ["members", "extra"], Members: ["[alias](./A%20One.md#heading)", "[[B]]", 42, null], extra: "[[Missing|alias]]", unlinked: "[[Missing]]" },
      "Folder/A One.md": {}
    }, [root("Folder/Owner.md", "Folder/A One.md"), root("Folder/Owner.md", "Missing.md")]);
    await f.host.cut(f.view);
    expect(f.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(f.docs["Folder/Owner.md"]).toEqual({
      rootNodeProperties: ["members", "extra"], Members: ["[[B]]", 42, null], extra: [], unlinked: "[[Missing]]"
    });
    expect(f.clipboard.match("[[Folder/A One]]\n[[Missing]]")).toEqual(["Folder/A One.md", "Missing.md"]);
  });

  it("uses case-insensitive defaults and preserves explicitly disabled roots", async () => {
    const f = fixture({ "One.md": { Members: ["[[A]]"], MEMBERS: ["[[A]]"] },
      "Two.md": { rootNodeProperties: [], rootNodes: ["[[A]]"] }, "A.md": {}
    }, [root("One.md"), root("Two.md", "A.md", "two")], ["members"]);
    await f.host.cut(f.view);
    expect(f.docs["One.md"]).toEqual({ Members: [], MEMBERS: [] });
    expect(f.docs["Two.md"].rootNodes).toEqual(["[[A]]"]);
  });
});

describe("shared view and embed Cut host", () => {
  it("waits for connected surfaces concurrently before publishing or writing properties", async () => {
    const f = fixture({ "Owner.md": { rootNodes: ["[[A]]"] }, "A.md": {} }, [root("Owner.md")]);
    let release!: () => void;
    const pendingWrite = new Promise<void>(resolve => { release = resolve; });
    const wait = vi.fn(function (this: GraphCutSurface) {
      return this === f.view ? pendingWrite : Promise.resolve();
    });
    f.surfaces.push({ ...f.embed });
    Object.assign(f.view, { waitForCutWrites: wait });
    Object.assign(f.embed, { waitForCutWrites: wait });

    const cut = f.host.cut(f.view);
    expect(wait.mock.contexts).toEqual([f.view, f.embed]);
    expect(f.write).not.toHaveBeenCalled();
    expect(f.processFrontMatter).not.toHaveBeenCalled();
    release();
    await cut;
    expect(f.events.slice(0, 2)).toEqual(["clipboard", "Owner.md"]);
    expect(f.docs["Owner.md"].rootNodes).toEqual([]);
  });

  it("aborts on a rejected surface wait and releases the guard for a retry", async () => {
    const f = fixture({ "Owner.md": { rootNodes: ["[[A]]"] }, "A.md": {} }, [root("Owner.md")]);
    const error = Error("pending surface write failed");
    const wait = vi.fn<() => Promise<void>>().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    Object.assign(f.embed, { waitForCutWrites: wait });
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await f.host.cut(f.view);
      expect(report).toHaveBeenCalledWith("[NosyGraph] Cut failed", error);
      expect(notices).toEqual(["Cut failed. Check graph memberships before retrying."]);
      expect(f.write).not.toHaveBeenCalled();
      expect(f.processFrontMatter).not.toHaveBeenCalled();
      expect(f.host.canCut(f.view)).toBe(true);

      await f.host.cut(f.view);
      expect(f.write).toHaveBeenCalledTimes(1);
      expect(f.processFrontMatter).toHaveBeenCalledTimes(1);
    } finally {
      report.mockRestore();
    }
  });

  it("edits a mixed root, classic lens, and nested Lens from the captured plan and publishes each selected path once", async () => {
    const scope = definition("Scope.md", ["scope", "extra"], "outgoing", "lens");
    const otherScope = definition("Scope2.md", ["secondary"], "outgoing", "lens");
    const f = fixture({
      "Parent.md": { rootNodes: ["[[Classic]]", "[[Other]]"] },
      "Classic.md": { rootNodes: ["[[A]]"], scope: ["[[A|member]]", "[[B]]"], Extra: "[[A#section]]", secondary: ["[[A]]"], untouched: ["[[A]]"] },
      "Scope.md": { linkType: "lens", property: "scope", properties: "extra" },
      "Scope2.md": { linkType: "lens", property: "secondary" }, "A.md": {}, "B.md": {}
    }, [root("Parent.md", "Classic.md"), root("Classic.md"), lens("Classic.md", "A.md", scope, "lens1"),
      lens("Classic.md", "A.md", otherScope, "lens2")]);
    const source = f.embed.getCutSource();
    const pending = f.host.cut(f.embed);
    await f.host.cut(f.view);
    await pending;
    expect(f.embed.getCutSource()).toBe(source);
    expect(f.write).toHaveBeenCalledTimes(1);
    expect(f.clipboard.match("[[Classic]]\n[[A]]")).toEqual(["Classic.md", "A.md"]);
    expect(f.processFrontMatter).toHaveBeenCalledTimes(2);
    expect(f.docs["Parent.md"].rootNodes).toEqual(["[[Other]]"]);
    expect(f.docs["Classic.md"]).toEqual({ rootNodes: [], scope: ["[[B]]"], Extra: [], secondary: [], untouched: ["[[A]]"] });
    expect(f.events).toEqual(["clipboard", "Parent.md", "Classic.md", "refresh embed", "refresh view", "persist embed", "persist view"]);
    expect(f.view.refreshAfterCut).toHaveBeenCalledWith([
      expect.objectContaining({ file: f.files.get("Parent.md") }), expect.objectContaining({ file: f.files.get("Classic.md") })
    ]);
  });

  it.each(["incoming", "outgoing", "both"] as const)("uses %s discovery orientation and the selected child clipboard identity", async direction => {
    const f = fixture({
      "B.md": { relates: ["[[C]]", "[[Keep]]"], extra: "[[C]]", unrelated: "[[C]]" },
      "C.md": { relates: "[[B]]", extra: ["[[B]]", "[[Keep]]"] },
      "Relates.md": { property: "relates", properties: "extra", linkDiscoveryDirection: direction }
    }, [expansion("B.md", "C.md", definition("Relates.md", ["relates", "extra"], direction))]);
    await f.host.cut(f.view);
    const outgoing = direction !== "incoming", incoming = direction !== "outgoing";
    expect(f.docs["B.md"]).toEqual({ relates: outgoing ? ["[[Keep]]"] : ["[[C]]", "[[Keep]]"], extra: outgoing ? [] : "[[C]]", unrelated: "[[C]]" });
    expect(f.docs["C.md"]).toEqual({ relates: incoming ? [] : "[[B]]", extra: incoming ? ["[[Keep]]"] : ["[[B]]", "[[Keep]]"] });
    expect(f.clipboard.match("[[C]]")).toEqual(["C.md"]);
  });

  it("deduplicates actual same-key edits but keeps independent definitions and reports body and filter skips", async () => {
    const f = fixture({
      "B.md": { one: "[[C]]", two: ["[[C]]", "[[D]]"] }, "C.md": {},
      "One.md": { property: "one" }, "Two.md": { property: "two" }
    }, [expansion("B.md", "C.md", definition("One.md", ["one"]), definition("Two.md", ["two"])),
      expansion("B.md", "C.md", definition("Two.md", ["two"])),
      { nodeId: "body", path: "Body.md", origin: { kind: "unavailable", reason: "Body links cannot be cut." } },
      { nodeId: "filter", path: "Filter.md", origin: { kind: "unavailable", reason: "Base filter." } }]);
    await f.host.cut(f.view);
    expect(f.docs["B.md"]).toEqual({ one: [], two: ["[[D]]"] });
    expect(f.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(notices[0]).toMatch(/2 skipped.*1 note link.*2 property reference.*Body links.*Base filter/);
  });

  it("retains recovery links when a reverse holder fails and preserves ambiguous values", async () => {
    const f = fixture({ "B.md": { relates: ["[[C]]"], extra: "keep [[C]] here" }, "C.md": { relates: "[[B]]" },
      "Relates.md": { property: "relates", properties: "extra", linkDiscoveryDirection: "both" }
    }, [expansion("B.md", "C.md", definition("Relates.md", ["relates", "extra"], "both"))]);
    f.processFrontMatter.mockImplementationOnce(async (file, mutate) => mutate(f.docs[file.path]));
    f.processFrontMatter.mockRejectedValueOnce(Error("write failed"));
    await f.host.cut(f.view);
    expect(f.docs["B.md"]).toEqual({ relates: [], extra: "keep [[C]] here" });
    expect(f.docs["C.md"].relates).toBe("[[B]]");
    expect(f.clipboard.match("[[C]]")).toEqual(["C.md"]);
    expect(notices[0]).toMatch(/1 partially unlinked.*Ambiguous value.*Could not update C.md.*recovery/);
    expect(f.embed.refreshAfterCut).toHaveBeenCalledWith([expect.objectContaining({ file: f.files.get("B.md") })]);
  });

  it("revalidates definitions after publication and leaves newly added unrelated values intact", async () => {
    const f = fixture({ "B.md": { one: ["[[C]]"], rootNodes: ["[[C]]"] }, "C.md": {}, "One.md": { property: "one" } },
      [expansion("B.md", "C.md", definition("One.md", ["one"])), root("B.md", "C.md")]);
    f.write.mockImplementationOnce(async () => { f.docs["One.md"].property = "other"; f.docs["B.md"].rootNodes = ["[[C]]", 51, "[[D]]"]; });
    await f.host.cut(f.view);
    expect(f.docs["B.md"]).toEqual({ one: ["[[C]]"], rootNodes: [51, "[[D]]"] });
    expect(notices[0]).toMatch(/1 failed.*definition changed/);
  });

  it("does not edit or refresh after clipboard rejection", async () => {
    const f = fixture({ "Owner.md": { rootNodes: ["[[A]]"] }, "A.md": {} }, [root("Owner.md")]);
    f.write.mockRejectedValueOnce(Error("denied"));
    await f.host.cut(f.view);
    expect(f.processFrontMatter).not.toHaveBeenCalled();
    expect(f.embed.refreshAfterCut).not.toHaveBeenCalled();
    expect(notices[0]).toMatch(/No properties changed/);
  });
});

describe("host-neutral batching and clipboard", () => {
  it("stops a stale source before publishing or mutating", async () => {
    const target = root("Owner.md");
    const edit: GraphCutReference = { holderPath: "Owner.md", property: "rootNodes", referencePath: "A.md", targets: [target] };
    const publish = vi.fn(), remove = vi.fn();
    await cutGraphNodes([target], { plan: async () => ({ edits: [edit], skipped: [] }), publish, remove, isCurrent: () => false });
    expect(publish).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("publishes serialized links in selection order and registers only after the write", async () => {
    const calls: string[] = [];
    const register = vi.fn(() => calls.push("register"));
    const count = await publishGraphNodeLinks(["A.md", "Missing.md", "A.md"], "Owner.md", {
      serialize: (path, source) => path === "A.md" ? `[A](${source}/A.md)` : "[[Missing]]",
      write: async text => { expect(text).toBe("[A](Owner.md/A.md)\n[[Missing]]"); calls.push("write"); }, register
    });
    expect(count).toBe(2);
    expect(calls).toEqual(["write", "register"]);
    expect(register).toHaveBeenCalledWith(["A.md", "Missing.md"], "[A](Owner.md/A.md)\n[[Missing]]");
  });
});
