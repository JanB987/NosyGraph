import { describe, expect, it, vi } from "vitest";
import { TFile, TFolder } from "obsidian";

vi.mock("obsidian", () => ({
  TFile: class {}, TFolder: class {}, Plugin: class {}, PluginSettingTab: class {},
  MarkdownRenderChild: class {}, MarkdownView: class {}, WorkspaceLeaf: class {}, FuzzySuggestModal: class {}, Modal: class {},
  Notice: class { constructor(message: string) { notices(message); } },
  parseYaml: (value: string) => JSON.parse(value), normalizePath: (path: string) => path
}));
vi.mock("./GraphView", () => ({ BASES_GRAPH_VIEW: "graph", BasesGraphView: class {} }));
vi.mock("./GraphEngine", () => ({ GraphEngine: class {} }));
const { notices } = vi.hoisted(() => ({ notices: vi.fn() }));
import Plugin, { normalizeGraphNoteTemplatePath } from "./main";
import { ObsidianTemplaterAdapter } from "./ObsidianTemplaterAdapter";

function fixture(content = "# Template\n") {
  notices.mockClear();
  const root = Object.assign(new TFolder(), { path: "/" });
  const template = Object.assign(new TFile(), { path: "Templates/graph.md", extension: "md" });
  const file = Object.assign(new TFile(), { path: "Moved/Final.md", basename: "Final", extension: "md" });
  let rendered = content;
  const create = vi.fn(async () => file);
  const apply = vi.fn(async () => {});
  const vault = {
    getAbstractFileByPath: vi.fn((path: string) => path === template.path ? template : null),
    getRoot: () => root, create: vi.fn(),
    process: vi.fn(async (_file: TFile, transform: (text: string) => string) => { rendered = transform(rendered); })
  };
  const app = { vault, workspace: { getActiveFile: () => null }, plugins: { getPlugin: () => ({ templater: { create_new_note_from_template: create, write_template_to_file: apply } }) } };
  const plugin = Object.assign(Object.create(Plugin.prototype), { app, settings: { graphNoteTemplatePath: template.path, noteTypeIdentifiers: { graph: { property: "type", value: "graph" } } }, resolveCurrentLeafForFile: vi.fn(() => ({})), openFileInGraphView: vi.fn(async () => true), openFileInMarkdownView: vi.fn(async () => {}) });
  return { plugin, app, vault, root, template, file, create, apply, content: () => rendered };
}

describe("graph note template creation", () => {
  it("normalizes saved paths and rejects malformed values", () => {
    expect(normalizeGraphNoteTemplatePath(" /Templates\\\\graph.md ")).toBe("Templates/graph.md");
    expect(normalizeGraphNoteTemplatePath({})).toBe("");
    expect(normalizeGraphNoteTemplatePath("../x.md")).toBe("");
  });
  it("rejects every embedded C0 code unit after normalizing the path", () => {
    for (let code = 0; code < 0x20; code++) {
      expect(normalizeGraphNoteTemplatePath("Templates/A" + String.fromCharCode(code) + "B.md"),
        "embedded code unit " + code).toBe("");
    }
    expect(normalizeGraphNoteTemplatePath("\t /Templates\\\\日本語 graph.md/ \r\n")).toBe("Templates/日本語 graph.md");
    expect(normalizeGraphNoteTemplatePath("C:\\Templates\\graph.md")).toBe("");
    expect(normalizeGraphNoteTemplatePath("Templates/./graph.md")).toBe("");
    expect(normalizeGraphNoteTemplatePath("Templates/../graph.md")).toBe("");
  });
  it("loads a normalized template setting and persists it", async () => {
    const plugin = Object.assign(Object.create(Plugin.prototype), {
      settings: {}, settingsWriteQueue: Promise.resolve(), loadData: vi.fn(async () => ({ graphNoteTemplatePath: " /Templates\\graph.md " })), saveData: vi.fn(async () => {})
    });
    await plugin.loadPluginSettings();
    expect(plugin.settings.graphNoteTemplatePath).toBe("Templates/graph.md");
    await plugin.savePluginSettings();
    expect(plugin.saveData).toHaveBeenCalledWith(expect.objectContaining({ graphNoteTemplatePath: "Templates/graph.md" }));
  });
  it("uses the built-in note without Templater when no template is selected", async () => {
    const f = fixture();
    f.plugin.settings.graphNoteTemplatePath = "";
    f.plugin.settings.graphPropertyKeys = { rootNodes: "rootNodes", activeLinkTypes: "activeLinkTypes", visibleLinkTypeLineStyle: "visibleLinkTypeLineStyle", discoveredLinkLineStyle: "discoveredLinkLineStyle", autoExpandDroppedLinkTypes: "autoExpandDroppedLinkTypes", graphForceGravity: "graphForceGravity", graphForceRepellent: "graphForceRepellent", graphNodeSize: "graphNodeSize", graphNodeConnectionSizeMultiplier: "graphNodeConnectionSizeMultiplier", graphVelocityNearRestThreshold: "graphVelocityNearRestThreshold", graphVelocityRestThreshold: "graphVelocityRestThreshold", showNodeIcons: "showNodeIcons" };
    f.vault.create.mockResolvedValue(f.file as never);
    await f.plugin.createNewGraphNoteFromTemplate();
    expect(f.vault.create).toHaveBeenCalledWith("Graph Note.md", expect.stringContaining("# Graph Note"));
    expect(f.create).not.toHaveBeenCalled();
    expect(f.plugin.openFileInGraphView).toHaveBeenCalledWith(f.file, expect.anything());
  });
  it("passes the explicit root, filename and false, then opens the returned moved file", async () => {
    const f = fixture();
    await f.plugin.createNewGraphNoteFromTemplate();
    expect(f.create).toHaveBeenCalledWith(f.template, f.root, "Graph Note", false);
    expect(f.plugin.openFileInGraphView).toHaveBeenCalledWith(f.file, expect.anything());
    expect(f.content()).toBe("---\ntype: \"graph\"\n---\n# Template\n");
    expect(f.vault.create).not.toHaveBeenCalled();
  });
  it("preserves matching properties and template content", async () => {
    const text = '---\n{"Type":["graph", "other"],"title":"hello"}\n---\n# Body\n```o3graph\n{}\n```';
    const f = fixture(text);
    await f.plugin.createNewGraphNoteFromTemplate();
    expect(f.content()).toBe(text);
    expect(f.plugin.openFileInGraphView).toHaveBeenCalled();
  });
  it("opens conflicts in Markdown without overwriting them", async () => {
    const text = '---\n{"TYPE":"other"}\n---\nBody';
    const f = fixture(text);
    await f.plugin.createNewGraphNoteFromTemplate();
    expect(f.content()).toBe(text);
    expect(f.plugin.openFileInMarkdownView).toHaveBeenCalledWith(f.file, expect.anything());
    expect(f.plugin.openFileInGraphView).not.toHaveBeenCalled();
  });
  it("rejects a missing template and missing capability", async () => {
    const f = fixture();
    f.vault.getAbstractFileByPath.mockReturnValue(null);
    await f.plugin.createNewGraphNoteFromTemplate();
    expect(f.create).not.toHaveBeenCalled();
    f.vault.getAbstractFileByPath.mockReturnValue(f.template);
    f.app.plugins.getPlugin = () => ({ templater: { create_new_note_from_template: undefined as never, write_template_to_file: f.apply } });
    await f.plugin.createNewGraphNoteFromTemplate();
    expect(f.create).not.toHaveBeenCalled();
  });
  it("does not report success for undefined results or thrown failures", async () => {
    const f = fixture();
    f.create.mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error("failed"));
    await f.plugin.createNewGraphNoteFromTemplate();
    await f.plugin.createNewGraphNoteFromTemplate();
    expect(f.plugin.openFileInGraphView).not.toHaveBeenCalled();
    expect(notices.mock.calls.flat().join(" ")).not.toContain("Created graph note:");
  });
  it("keeps selected-node template application on the existing API", async () => {
    const f = fixture();
    await new ObsidianTemplaterAdapter(f.app as never).applyTemplate(f.template, f.file);
    expect(f.apply).toHaveBeenCalledWith(f.template, f.file);
    expect(f.create).not.toHaveBeenCalled();
  });
});

it("loads, saves and moves selected-notes panel widths in plugin settings", async () => {
  const plugin = Object.assign(Object.create(Plugin.prototype), {
    settings: {}, settingsWriteQueue: Promise.resolve(), saveData: vi.fn(async () => {}),
    loadData: vi.fn(async () => ({
      graphNoteTemplatePath: "Graphs/Template.md",
      graphTabPanelWidths: { "Graphs/A.md": 315, "B.md": 1800, "C.md": "invalid" }
    }))
  });
  await plugin.loadPluginSettings();
  expect(plugin.settings.graphTabPanelWidths).toEqual({ "Graphs/A.md": 315, "B.md": 1200 });
  await plugin.saveGraphTabPanelWidth("Graphs/A.md", 350);
  expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
    graphTabPanelWidths: { "Graphs/A.md": 350, "B.md": 1200 }
  }));
  await plugin.rekeyFileSettings("Graphs", "Moved Graphs");
  expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
    graphNoteTemplatePath: "Moved Graphs/Template.md",
    graphTabPanelWidths: { "Moved Graphs/A.md": 350, "B.md": 1200 }
  }));
});
