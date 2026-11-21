import { describe, expect, it, vi } from "vitest";
import type { App, ViewState, WorkspaceLeaf } from "obsidian";

const host = vi.hoisted(() => ({
  notices: [] as string[],
  menu: [] as Array<{ title: string; click?: () => void }>
}));

vi.mock("obsidian", () => ({
  TFile: class { constructor(public path: string, public extension = "md") {} },
  Notice: class { constructor(text: string) { host.notices.push(text); } },
  Menu: class {
    constructor() { host.menu.length = 0; }
    addItem(build: (item: unknown) => void) {
      const data: { title: string; click?: () => void } = { title: "" };
      const item = {
        setTitle: (title: string) => { data.title = title; return item; },
        setIcon: () => item, setChecked: () => item, onClick: (click: () => void) => { data.click = click; return item; }
      };
      build(item);
      host.menu.push(data);
    }
    addSeparator() {}
    showAtMouseEvent() {}
  },
  setTooltip: (element: MockElement, text: string) => { element.title = text; },
  MarkdownView: class {
    file: { path: string } | null = null;
    mode = "source";
    save = vi.fn(async () => undefined);
    onLoadFile = async (file: { path: string }) => { this.file = file; };
    getEphemeralState = () => ({ cursor: { line: 2 } });
    containerEl = new MockElement();
    headerEl = this.containerEl.createDiv();
    contentEl = this.containerEl.createDiv();
    allowNoFile = false;
    constructor(readonly leaf: MockLeaf) {}
    getState() { return { file: this.file?.path ?? null, mode: this.mode }; }
    async setState(state: { file?: string; mode?: string }, result: { history: boolean }) {
      this.mode = state.mode ?? this.mode;
      this.file = state.file ? this.leaf.files.get(state.file) ?? null : null;
      result.history = true;
    }
    addAction(_icon: string, title: string, click: () => void) {
      const action = new MockElement(title);
      action.click = click;
      action.closest = (selector: string) => selector === ".view-header" ? this.headerEl : null;
      this.leaf.actions.push(action);
      return action;
    }
    async onOpen() {}
    async onClose() {}
  }
}));

vi.mock("./GraphView", () => ({
  BASES_GRAPH_VIEW: "nosygraph-view",
  BasesGraphView: class {
    file: { path: string } | null = null;
    graphTabProblem = "";
    status = "";
    containerEl = new MockElement();
    constructor(readonly leaf: MockLeaf) {}
    isGraphTab = () => true;
    captureGraphTabReturn = () => undefined;
    renderGraphTabStatus(status: string) { this.status = status; }
    async onOpen() {}
    async onClose() {}
    getState() { return { ...this.leaf.controller.viewState(leafPort(this.leaf), "graph"), file: this.file?.path }; }
    async setState(state: Record<string, unknown>) {
      this.leaf.controller.initializeView(leafPort(this.leaf), state, "graph");
      this.file = typeof state.file === "string" ? this.leaf.files.get(state.file) ?? null : null;
      this.graphTabProblem = String(state.graphTabProblem ?? "");
    }
  }
}));

import { TFile } from "obsidian";
import { GraphTabMarkdownView, GRAPH_TAB_MARKDOWN_VIEW } from "./GraphTabMarkdownView";
import { BASES_GRAPH_VIEW, BasesGraphView } from "./GraphView";
import { ObsidianGraphTabController } from "./ObsidianGraphTabController";
import { emptyGraphTabSelection, graphTabSelection, type GraphTabSession } from "./graph-application/GraphTabSession";

class MockElement {
  readonly children: MockElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: Record<string, unknown>) => void>();
  readonly ownerDocument = { activeElement: null };
  readonly style = { setProperty: vi.fn() };
  readonly classList = { toggle: vi.fn(), add: vi.fn() };
  previousElementSibling = null;
  title = "";
  hidden = false;
  disabled = false;
  width = 600;
  pointer?: number;
  click?: () => void;
  constructor(public text = "") {}
  createEl(_tag: string, options?: { text?: string; attr?: Record<string, string> }) {
    const child = new MockElement(options?.text);
    for (const [key, value] of Object.entries(options?.attr ?? {})) child.setAttribute(key, value);
    this.children.push(child);
    return child;
  }
  createDiv(options?: { text?: string }) { return this.createEl("div", options); }
  setText(text: string) { this.text = text; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  addEventListener(name: string, listener: (event: Record<string, unknown>) => void) {
    this.listeners.set(name, listener);
    if (name === "click") this.click = () => listener({});
  }
  getBoundingClientRect() { return { width: this.width }; }
  setPointerCapture(pointer: number) { this.pointer = pointer; }
  hasPointerCapture(pointer: number) { return this.pointer === pointer; }
  releasePointerCapture() { this.pointer = undefined; }
  closest(_selector: string): MockElement | null { return null; }
  empty() { this.children.length = 0; }
  contains(other: MockElement): boolean { return this === other || this.children.some(child => child.contains(other)); }
  remove() {}
}

interface MockView {
  file: TFile | null;
  containerEl: MockElement;
  getState(): Record<string, unknown>;
  onOpen?(): Promise<void>;
  onClose?(): Promise<void>;
  setState?(state: Record<string, unknown>, result: { history: boolean }): Promise<void>;
}

class MockLeaf {
  group = "";
  type = "markdown";
  readonly actions: MockElement[] = [];
  readonly changes: Array<{ type: string; file: unknown; active?: boolean; ephemeral?: unknown; history: boolean }> = [];
  view: MockView;
  constructor(readonly id: string, readonly controller: ObsidianGraphTabController,
    readonly files: Map<string, TFile>, path: string, private readonly panelWidths: ConstructorParameters<typeof GraphTabMarkdownView>[2]) {
    this.view = this.plainView(path);
  }
  private plainView(path: string): MockView {
    return { file: this.files.get(path) ?? null, containerEl: new MockElement(), getState: () => ({ file: path }) };
  }
  setGroup(group: string) { this.group = group; }
  getViewState() { return { type: this.type, state: this.view.getState(), group: this.group }; }
  openFile(file: TFile, options?: { state?: Record<string, unknown>; eState?: unknown }) {
    return this.setViewState({ type: "markdown", state: { ...options?.state, file: file.path } }, options?.eState);
  }
  async setViewState(state: ViewState, ephemeral?: unknown) {
    const input = state.state ?? {};
    const result = { history: false };
    if (state.type !== this.type) {
      await this.view.onClose?.();
      this.type = state.type;
      this.actions.length = 0;
      if (state.type === GRAPH_TAB_MARKDOWN_VIEW) {
        this.view = new GraphTabMarkdownView(leafPort(this), this.controller, this.panelWidths) as unknown as MockView;
      } else if (state.type === BASES_GRAPH_VIEW) {
        this.view = new BasesGraphView(leafPort(this)) as unknown as MockView;
      } else this.view = this.plainView(String(input.file ?? ""));
      await this.view.onOpen?.();
    } else if (state.type === "markdown") {
      this.view = this.plainView(String(input.file ?? ""));
    }
    await this.view.setState?.({ ...input }, result);
    this.changes.push({ type: state.type, file: input.file, active: state.active, ephemeral, history: result.history });
  }
}

function leafPort(leaf: MockLeaf): WorkspaceLeaf { return leaf as unknown as WorkspaceLeaf; }

function fixture(ready = true) {
  host.notices.length = 0;
  const files = new Map(["G.md", "G2.md", "A.md", "B.md", "C.md", "folder/A.md", "bad.canvas"].map(path => [
    path, Object.assign(new TFile(), { path, extension: path.endsWith(".md") ? "md" : "canvas" })
  ]));
  const leaves = new Map<string, MockLeaf>();
  const workspace = {
    layoutReady: ready,
    iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
      for (const leaf of leaves.values()) callback(leafPort(leaf));
    },
    getLeafById: (id: string) => leaves.get(id) ?? null,
    requestSaveLayout: vi.fn(async () => undefined),
    setActiveLeaf: vi.fn(),
    getLeaf: vi.fn()
  };
  const app = { workspace, vault: { getAbstractFileByPath: (path: string) => files.get(path) } };
  const controller = new ObsidianGraphTabController(app as unknown as App, file => file.path.startsWith("G"));
  const widths = new Map<string, number>();
  const saveWidth = vi.fn(async (path: string, width: number) => { widths.set(path, width); });
  const add = (id: string, path: string) => {
    const leaf = new MockLeaf(id, controller, files, path, { read: path => widths.get(path), save: saveWidth });
    leaves.set(id, leaf);
    return leaf;
  };
  const openFollower = async (id = "follower", file = "G.md") => {
    const tab = add(id, file);
    await tab.setViewState({ type: BASES_GRAPH_VIEW, state: { file, graphTab: true } });
    await settle();
    return tab;
  };
  const surface = (tab: MockLeaf, path: string, selections: string[], interacted = false) => {
    tab.type = BASES_GRAPH_VIEW;
    controller.publishGraph(leafPort(tab), path,
      graphTabSelection(selections.map((path, index) => ({ path, nodeId: `lens:${index}` }))), interacted);
  };
  return { files, leaves, workspace, controller, add, openFollower, surface, saveWidth };
}

async function settle() {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function session(tab: MockLeaf): GraphTabSession { return tab.view.getState().graphTabSession as GraphTabSession; }

function chooseSource(tab: MockLeaf, label: string) {
  const action = tab.actions.find(action => action.text === "Graph Tab source");
  action?.click?.();
  const option = host.menu.find(item => item.title.includes(label));
  expect(option?.click).toBeTypeOf("function");
  option?.click?.();
}

describe("registered Graph Tab controller and native Markdown adapter", () => {
  it("previews resizing, saves once on release by graph root, and restores on reopening", async () => {
    const f = fixture();
    const source = f.add("source", "G.md");
    const tab = await f.openFollower();
    f.surface(source, "G.md", ["A.md", "B.md"], true);
    f.controller.toggle(leafPort(tab));
    await settle();
    const [, , panel, handle] = tab.view.containerEl.children;
    expect(handle.hidden).toBe(false);
    panel.width = 200;
    const pointer = { button: 0, pointerId: 1, clientX: 400, preventDefault: vi.fn() };
    handle.listeners.get("pointerdown")?.(pointer);
    handle.listeners.get("pointermove")?.({ ...pointer, clientX: 360 });
    handle.listeners.get("pointermove")?.({ ...pointer, clientX: 315 });
    expect(f.saveWidth).not.toHaveBeenCalled();
    expect(tab.view.containerEl.style.setProperty).toHaveBeenLastCalledWith("grid-template-columns", expect.stringContaining("285px"));
    handle.listeners.get("pointerup")?.(pointer);
    expect(f.saveWidth).toHaveBeenCalledExactlyOnceWith("G.md", 285);
    expect(tab.view.file?.path).toBe("A.md");

    panel.width = 285;
    handle.listeners.get("pointerdown")?.(pointer);
    handle.listeners.get("pointermove")?.({ ...pointer, clientX: 350 });
    handle.listeners.get("pointercancel")?.(pointer);
    expect(f.saveWidth).toHaveBeenCalledTimes(1);
    expect(tab.view.containerEl.style.setProperty).toHaveBeenLastCalledWith("grid-template-columns", expect.stringContaining("285px"));

    f.leaves.delete(tab.id);
    f.controller.refresh();
    await settle();
    const reopened = await f.openFollower("reopened");
    f.controller.toggle(leafPort(reopened));
    await settle();
    expect(reopened.view.containerEl.style.setProperty).toHaveBeenCalledWith("grid-template-columns", expect.stringContaining("285px"));
    f.controller.chooseNote(leafPort(reopened), "B.md");
    await settle();
    expect(reopened.view.file?.path).toBe("B.md");
    expect(f.saveWidth).toHaveBeenCalledTimes(1);
  });

  it("follows an external graph including duplicate instances, navigates the menu one-way, and returns to the root", async () => {
    const f = fixture();
    const other = f.add("other", "G.md");
    const tab = await f.openFollower();
    f.surface(other, "G.md", ["A.md", "A.md", "folder/A.md"], true);
    f.controller.toggle(leafPort(tab));
    await settle();
    expect(tab.type).toBe(GRAPH_TAB_MARKDOWN_VIEW);
    expect(tab.view).toBeInstanceOf(GraphTabMarkdownView);
    expect(tab.view.file?.path).toBe("A.md");
    expect(tab.actions.map(action => action.text)).toEqual(["Switch to graph", "Graph Tab source"]);
    const [header, , menu] = tab.view.containerEl.children;
    expect(header.classList.add).toHaveBeenCalledWith("view-header-always-show");
    expect(menu.children.slice(1).map(child => child.attributes.get("data-note-path"))).toEqual(["A.md", "folder/A.md"]);
    menu.children[2].click?.();
    await settle();
    expect(tab.view.file?.path).toBe("folder/A.md");
    expect(session(tab).graphSourcePath).toBe("G.md");
    expect(other.changes).toEqual([]);
    f.controller.toggle(leafPort(tab));
    await settle();
    expect(tab.type).toBe(BASES_GRAPH_VIEW);
    expect(tab.view.file?.path).toBe("G.md");
    expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
    expect(f.workspace.getLeaf).not.toHaveBeenCalled();
  });

  it("links to one of two duplicate-file tabs, follows inactive navigation, and fails closed on closure", async () => {
    const f = fixture();
    const a = f.add("a", "G.md");
    const b = f.add("b", "G.md");
    const tab = await f.openFollower();
    f.controller.toggle(leafPort(tab));
    await settle();
    chooseSource(tab, "Tab 1");
    await settle();
    expect(session(tab).binding).toMatchObject({ kind: "linked", sourceTabId: "a" });
    f.surface(b, "G.md", ["B.md"], true);
    await settle();
    expect(tab.view.file?.path).toBe("G.md");
    await a.setViewState({ type: "markdown", state: { file: "A.md" }, active: false });
    await settle();
    expect(tab.view.file?.path).toBe("A.md");
    f.controller.toggle(leafPort(tab));
    await settle();
    expect((tab.view as unknown as BasesGraphView).graphTabProblem).toContain("no NosyGraph");
    f.leaves.delete("a");
    f.controller.refresh();
    await settle();
    expect((tab.view as unknown as { status: string }).status).toBe("Source tab unavailable");
    expect(session(tab).graphSourcePath).toBe("A.md");
    expect(session(tab).binding).toMatchObject({ kind: "linked", sourceTabId: "a", unavailable: true });
    f.controller.toggle(leafPort(tab));
    await settle();
    expect(tab.view.file?.path).toBe("A.md");
    chooseSource(tab, "Unlink");
    await settle();
    expect(session(tab).binding.kind).toBe("automatic");
    expect(tab.view.file?.path).toBe("B.md");
  });

  it("preserves the editor across failed saves and coalesces newer source and mode requests", async () => {
    const f = fixture();
    const source = f.add("source", "G.md");
    const tab = await f.openFollower();
    f.controller.toggle(leafPort(tab));
    await settle();
    const editor = tab.view as unknown as GraphTabMarkdownView;
    let release!: () => void;
    const save = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(editor.save).mockReturnValueOnce(save);
    f.surface(source, "G.md", ["A.md"], true);
    await settle();
    expect(editor.save).toHaveBeenCalledTimes(1);
    f.surface(source, "G.md", ["B.md"], true);
    await settle();
    f.surface(source, "G.md", ["C.md"], true);
    await settle();
    release();
    await settle();
    expect(tab.changes.map(change => change.file)).toEqual(["G.md", "G.md", "C.md"]);
    vi.mocked(editor.save).mockRejectedValueOnce(Error("simulated save failure"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    f.controller.toggle(leafPort(tab));
    await settle();
    expect(tab.view).toBe(editor);
    expect(tab.view.file?.path).toBe("C.md");
    expect(host.notices).toContain("Graph Tab could not save or switch views.");
    consoleError.mockRestore();
    f.controller.toggle(leafPort(tab));
    await settle();
    expect(tab.type).toBe(BASES_GRAPH_VIEW);
  });

  it("adopts in-place native Markdown navigation and preserves native editor state, history, and the binding", async () => {
    const f = fixture();
    const source = f.add("source", "G.md");
    const tab = await f.openFollower();
    f.controller.toggle(leafPort(tab));
    await settle();
    chooseSource(tab, "Tab 1");
    await settle();
    const before = tab.view;
    await tab.openFile(f.files.get("A.md")!, { state: { mode: "preview" }, eState: { subpath: "#heading" } });
    await settle();
    expect(tab.view).toBe(before);
    expect(tab.type).toBe(GRAPH_TAB_MARKDOWN_VIEW);
    expect(tab.view.getState()).toMatchObject({ file: "A.md", mode: "preview" });
    expect(tab.changes[tab.changes.length - 1]).toMatchObject({ ephemeral: { subpath: "#heading" }, history: true });
    expect(session(tab)).toMatchObject({ graphSourcePath: "G.md", binding: { sourceTabId: "source" } });
    expect(source.changes).toEqual([]);
    expect(tab.actions).toHaveLength(2);
  });

  it("uses an embed only for its owning file and picks up the linked source again after its file moves", async () => {
    const f = fixture();
    const owner = f.add("owner", "G.md");
    const tab = await f.openFollower();
    f.controller.toggle(leafPort(tab));
    await settle();
    chooseSource(tab, "Tab 1");
    await settle();
    const embeddedGraph = owner.view.containerEl.createDiv();
    const publish = f.controller.embedPublisher(Symbol(), embeddedGraph as unknown as HTMLElement);
    publish("G2.md", graphTabSelection([{ path: "A.md", nodeId: "nested-lens:A" }]), true);
    await settle();
    expect(tab.view.file?.path).toBe("A.md");
    expect(session(tab).graphSourcePath).toBe("G.md");
    const renamed = f.files.get("G.md")!;
    renamed.path = "G-renamed.md";
    f.files.delete("G.md");
    f.files.set(renamed.path, renamed);
    f.controller.rename("G.md", renamed.path);
    publish("G2.md", graphTabSelection([{ path: "B.md", nodeId: "discovered:B" }]), true);
    await settle();
    expect(session(tab).graphSourcePath).toBe("G-renamed.md");
    expect(tab.view.file?.path).toBe("B.md");
    await owner.openFile(f.files.get("C.md")!);
    publish("G2.md", graphTabSelection([{ path: "A.md", nodeId: "obsolete:A" }]), true);
    await settle();
    expect(session(tab).graphSourcePath).toBe("C.md");
    expect(tab.view.file?.path).toBe("C.md");
  });

  it("restores independent sessions after layout readiness and clears invalid candidates without opening the root", async () => {
    const f = fixture(false);
    const tab = f.add("follower", "B.md");
    const saved = {
      version: 1, sessionId: "saved", mode: "markdown", binding: { kind: "linked", sourceTabId: "deferred", labelHint: "G.md" },
      graphSourcePath: "G.md", activeMarkdownPath: "B.md",
      selection: graphTabSelection([{ path: "B.md", nodeId: "old" }]), localSelection: emptyGraphTabSelection
    };
    await tab.setViewState({ type: GRAPH_TAB_MARKDOWN_VIEW, state: { file: "B.md", graphTab: true, graphTabSession: saved } });
    await settle();
    expect(session(tab).binding).not.toHaveProperty("unavailable");
    const source = f.add("deferred", "G.md");
    f.workspace.layoutReady = true;
    f.surface(source, "G.md", ["missing.md", "bad.canvas"]);
    const second = await f.openFollower("second", "G2.md");
    expect(session(second).sessionId).not.toBe(session(tab).sessionId);
    expect(session(second).mode).toBe("graph");
    expect(tab.view.file).toBeNull();
    expect(tab.view.containerEl.children[2].children.slice(1).every(button => button.disabled)).toBe(true);
    f.surface(source, "G.md", []);
    await settle();
    expect(tab.view.file?.path).toBe("G.md");
  });
});
