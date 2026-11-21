import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {}
  class Modal {
    contentEl = new ElementFixture();
    modalEl = new ElementFixture();
    constructor(readonly app: unknown) {}
    open() { modals.push(this); (this as unknown as { onOpen(): void }).onOpen(); }
    close() { (this as unknown as { onClose(): void }).onClose(); }
  }
  class Notice { constructor(message: string) { notices.push(message); } }
  return { TFile, Modal, Notice };
});

import { TFile, type App } from "obsidian";
import { GraphNodeClipboardState, publishGraphNodeLinks } from "./GraphNodeClipboard";
import { requestGraphBadgeInput } from "./ObsidianGraphBadgeInputHost";
import { readGraphNoteLinkPaste } from "./ObsidianGraphNoteLinkPaste";
import { DEFAULT_GRAPH_PROPERTY_KEYS } from "./GraphPropertyKeys";
import { DEFAULT_LINK_TYPE_PROPERTY_KEYS } from "./NoteTypePropertyKeys";
import { BadgeMembershipPreference, BADGE_MEMBERSHIP_LABEL } from "./graph-application/BadgeMembershipPreference";
import type { GraphBadgeLinkInputRequest, GraphLinkDiscoveryDirection } from "./graph-application/GraphLinkMutation";

interface MockEvent {
  target?: ElementFixture;
  defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
  key?: string;
  repeat?: boolean;
  data?: string;
  clipboardData?: { getData(type: string): string };
}

class ElementFixture {
  style = { setProperty() {} };
  value = "";
  placeholder = "";
  text = "";
  disabled = false;
  children: ElementFixture[] = [];
  private handlers = new Map<string, (event: MockEvent) => void>();

  constructor(readonly tag = "div", private readonly parent?: ElementFixture) {}
  createEl(tag: string, options?: { text?: string; value?: string }) {
    const child = new ElementFixture(tag, this);
    child.text = options?.text ?? "";
    child.value = options?.value ?? "";
    this.children.push(child);
    return child;
  }
  createDiv(options?: { text?: string }) { return this.createEl("div", options); }
  addClass() {}
  empty() { this.text = ""; this.children = []; }
  setAttribute() {}
  setText(text: string) { this.text = text; }
  focus() {}
  addEventListener(event: string, listener: (event: MockEvent) => void) { this.handlers.set(event, listener); }
  removeEventListener(event: string) { this.handlers.delete(event); }
  emit(type: string, props: Partial<MockEvent> = {}) {
    let stopped = false;
    const event: MockEvent = {
      target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { stopped = true; },
      stopImmediatePropagation() { stopped = true; },
      ...props
    };
    for (let element: ElementFixture | undefined = this; element && !stopped; element = element.parent) {
      element.handlers.get(type)?.(event);
    }
    return event;
  }
  descendants(): ElementFixture[] { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  get texts() { return this.descendants().map(({ text }) => text).filter(Boolean); }
}

const modals: Array<{ contentEl: ElementFixture; close(): void }> = [];
const notices: string[] = [];

function note(path: string) {
  const name = path.split("/").at(-1)!;
  const extension = name.split(".").at(-1)!;
  return Object.assign(new TFile(), { path, name, extension, basename: name.slice(0, -(extension.length + 1)) });
}

function fixture(direction: GraphLinkDiscoveryDirection = "outgoing", membershipOn = true) {
  const clicked = note("Destination/Clicked.md");
  const a = note("Clipboard/A.md");
  const b = note("Clipboard/B (2).md");
  const local = note("Destination/A.md");
  const owner = note("Nested graph.md");
  const attachment = note("Diagram.png");
  const files = new Map([clicked, a, b, local, owner, attachment].map((file) => [file.path, file]));
  const frontmatters = new Map<string, Record<string, unknown>>();
  const process = vi.fn(async (file: TFile, write: (frontmatter: Record<string, unknown>) => void) => {
    const frontmatter = { ...frontmatters.get(file.path) };
    write(frontmatter);
    frontmatters.set(file.path, frontmatter);
  });
  const create = vi.fn(async (path: string) => {
    const file = note(path);
    files.set(path, file);
    return file;
  });
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path),
      getMarkdownFiles: () => [...files.values()].filter((file) => file.extension === "md"),
      createFolder: vi.fn(async (_path: string) => {}),
      create
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({ frontmatter: frontmatters.get(file.path) }),
      getFirstLinkpathDest: (path: string, source: string) => files.get(path) ?? files.get(`${path}.md`)
        ?? files.get(`${source.split("/").slice(0, -1).join("/")}/${path}.md`)
    },
    fileManager: {
      processFrontMatter: process,
      generateMarkdownLink: vi.fn((file: TFile, from: string) => {
        const sameFolder = file.path.split("/")[0] === from.split("/")[0];
        return sameFolder ? `[${file.basename}](./${encodeURIComponent(file.name)})` : `[[${file.path}]]`;
      })
    }
  };
  const state = new GraphNodeClipboardState();
  const match = vi.fn(state.match);
  const progress = vi.fn();
  const membershipProgress = vi.fn();
  const savePreference = vi.fn(async (value: boolean) => { membershipOn = value; });
  const preference = new BadgeMembershipPreference(() => membershipOn, savePreference);
  const target = { nodeId: "clicked-instance", path: clicked.path };
  const request = {
    target, membership: { kind: "note", ownerPath: owner.path, referencePath: clicked.path },
    write: { target, property: "related", readProperties: ["related", "aliases of relationship"],
      definitionId: "Definitions/Badge.md", semantic: "link", discoveryDirection: direction },
    isCurrent: vi.fn(() => true)
  } satisfies GraphBadgeLinkInputRequest;
  const host = {
    requestLinkInput: (draft: GraphBadgeLinkInputRequest) => requestGraphBadgeInput(app as unknown as App, draft, {
      matchClipboard: match, preference, onBatchCommitted: progress, onMembershipCommitted: membershipProgress
    }, () => ({
      graphPropertyKeys: DEFAULT_GRAPH_PROPERTY_KEYS, linkTypePropertyKeys: DEFAULT_LINK_TYPE_PROPERTY_KEYS, defaultRootNodeProperties: []
    }))
  };
  return { app, host, request, state, match, progress, membershipProgress, preference, savePreference, frontmatters, process, create, clicked, a, b, local, owner, files };
}

function modal() {
  const current = modals.at(-1)!;
  const content = current.contentEl;
  const input = content.descendants().find(({ tag }) => tag === "input")!;
  const button = (text: string) => content.descendants().find((entry) => entry.tag === "button" && entry.text === text);
  const key = (key: string, repeat = false) => input.emit("keydown", { key, repeat });
  return {
    current, content, input, button, key,
    paste: (text: string) => input.emit("paste", { clipboardData: { getData: (type) => type === "text/plain" ? text : "" } }),
    type: (text: string) => { input.value = text; input.emit("input"); }
  };
}

afterEach(() => {
  modals.length = 0;
  notices.length = 0;
  vi.restoreAllMocks();
});

describe("badge clipboard preview and submission", () => {
  it("resolves Copy/Cut text by session paths, resolves external text in destination context and reports stale paths", async () => {
    const f = fixture();
    const serialize = () => "[A](./A.md)";
    const writeText = vi.fn(async (_text: string) => {});
    const app = f.app as unknown as App;
    for (const operation of ["copy", "cut"]) {
      await publishGraphNodeLinks([f.a.path], "Clipboard/Graph.md", { serialize, write: writeText, register: (paths, text) => f.state.remember(paths, text) });
      const pasted = writeText.mock.calls.at(-1)![0];
      expect(pasted, operation).toBe("[A](./A.md)");
      expect(readGraphNoteLinkPaste(app, pasted, f.clicked.path, f.match)).toMatchObject([{ path: f.a.path, status: "ready" }]);
      expect(readGraphNoteLinkPaste(app, pasted, f.clicked.path, () => undefined)).toMatchObject([{ path: f.local.path, status: "ready" }]);
    }
    f.files.delete(f.a.path);
    expect(readGraphNoteLinkPaste(app, serialize(), f.clicked.path, f.match)).toMatchObject([{ path: f.a.path, status: "missing" }]);
    expect(readGraphNoteLinkPaste(app, "[[A]]", f.clicked.path, f.match)).toMatchObject([{ path: f.local.path }]);
  });

  it.each(["input value", "input event data", "first Enter"] as const)(
    "previews cut links supplied through %s without a clipboard paste event",
    async (insertion) => {
      const f = fixture();
      const links = "[[A]]\n[[B (2)]]";
      const flattened = "[[A]][[B (2)]]";
      f.state.remember([f.a.path, f.b.path], links);
      expect(f.state.match(flattened)).toBeUndefined();

      const result = f.host.requestLinkInput(f.request);
      const ui = modal();
      if (insertion === "input event data") {
        ui.type("Previous search");
        ui.input.value += flattened;
        ui.input.emit("input", { data: links });
      } else if (insertion === "first Enter") {
        ui.input.value = flattened;
        ui.key("Enter");
      } else {
        ui.type(flattened);
      }

      expect(ui.content.texts).toEqual(expect.arrayContaining([f.a.path, f.b.path, "Add 2 notes"]));
      expect(ui.content.texts.some((text) => text.startsWith("Create "))).toBe(false);
      expect(f.process).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
      ui.key("Enter");
      await expect(result).resolves.toMatchObject({ origin: "clipboard-batch", added: [f.a.path, f.b.path] });
      expect(f.process).toHaveBeenCalledOnce();
      expect(f.create).not.toHaveBeenCalled();
    }
  );

  it("keeps ordinary search and stages unregistered input-only links without exposing Create", async () => {
    const f = fixture();
    const result = f.host.requestLinkInput(f.request);
    const ui = modal();
    ui.type(f.a.path);
    expect(ui.button("Add 1 note")).toBeUndefined();
    expect(ui.content.texts).toContain(f.a.path);
    ui.type("[[Clipboard/A]][[Missing]]");
    ui.type("[[Clipboard/B (2)]]");
    expect(ui.content.texts).toEqual(expect.arrayContaining([f.a.path, f.b.path, "Note missing", "Add 2 notes"]));
    expect(ui.content.texts.some((text) => text.startsWith("Create "))).toBe(false);
    ui.key("Escape");
    await expect(result).resolves.toMatchObject({ added: [] });
    expect(f.process).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });

  it("shows paths and skipped reasons, appends in order, deduplicates and writes only the eligible subset on Enter", async () => {
    const f = fixture();
    const result = f.host.requestLinkInput(f.request);
    expect(f.match).not.toHaveBeenCalled();
    const ui = modal();
    expect(ui.paste("See [[A]] [[Clipboard/A]]\r\n- \"[[Missing]]\"\n[[Diagram.png]] [url](https://example.com)").defaultPrevented).toBe(true);
    ui.paste("[[Clipboard/A]] [[Destination/Clicked#Section]] [b](../Clipboard/B%20(2).md#Head)");
    expect(ui.content.texts).toEqual(expect.arrayContaining([
      "Ignored text", "Ambiguous link — use its full path", f.a.path, "Note missing", "Attachment",
      "External link", "Self-link", f.b.path, "Add 2 notes"
    ]));
    expect(ui.content.texts.filter((text) => text === f.a.path)).toHaveLength(1);
    expect(ui.content.texts.some((text) => text.startsWith("Create "))).toBe(false);
    expect(f.process).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    ui.key("Enter");
    await vi.waitFor(() => expect(f.progress).toHaveBeenCalledOnce());
    expect(f.process).toHaveBeenCalledOnce();
    expect(f.frontmatters.get(f.clicked.path)?.related).toEqual([`[[${f.a.path}]]`, `[[${f.b.path}]]`]);
    expect(ui.content.texts).toContain("Note missing");
    expect(ui.content.texts).toContain("Added");
    expect(ui.button("Add 2 notes")).toBeUndefined();
    ui.key("Escape");
    await expect(result).resolves.toMatchObject({ origin: "clipboard-batch", selected: [f.a.path, f.b.path], changedFilePaths: [f.clicked.path] });
  });

  it("supports Remove and Clear, preserves plain search/Create, and cancels before writes", async () => {
    const f = fixture();
    const result = f.host.requestLinkInput(f.request);
    const ui = modal();
    expect(ui.input.emit("paste").defaultPrevented).toBe(false);
    expect(ui.paste("Ordinary note name").defaultPrevented).toBe(false);
    ui.type("New note");
    expect(ui.content.texts).toContain("Create New note");
    ui.paste("[[Missing]] [[broken");
    expect(ui.button("Add 0 notes")).toBeUndefined();
    ui.key("Enter");
    expect(f.process).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    ui.button("Clear")!.emit("click");
    ui.paste("[[Clipboard/A]] [[Clipboard/B (2)]]");
    ui.button("Remove")!.emit("click");
    expect(ui.button("Add 1 note")).toBeDefined();
    ui.button("Clear")!.emit("click");
    ui.type("Another note");
    expect(ui.content.texts).toContain("Create Another note");
    ui.paste("[[Clipboard/A]]");
    ui.key("Escape");
    await expect(result).resolves.toEqual({ added: [], removed: [], skipped: [] });
    expect(f.process).not.toHaveBeenCalled();
  });

  it("does not redirect deleted or replaced rows and requires a new preview when the LinkType changes", async () => {
    const f = fixture();
    const result = f.host.requestLinkInput(f.request);
    const ui = modal();
    ui.paste("[[Clipboard/A]] [[Clipboard/B (2)]]");
    f.files.set(f.a.path, note(f.a.path));
    f.files.delete(f.b.path);
    ui.key("Enter");
    expect(f.process).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(ui.content.texts.filter((text) => text.includes("deleted after preview"))).toHaveLength(2));
    ui.paste("[[Destination/A]]");
    f.request.isCurrent.mockReturnValue(false);
    ui.key("Enter");
    expect(ui.content.texts.some((text) => text.includes("Reopen the badge input"))).toBe(true);
    expect(f.process).not.toHaveBeenCalled();
    ui.current.close();
    await expect(result).resolves.toMatchObject({ skipped: [f.a.path, f.b.path] });
  });

  it("shows an unavailable state without a configured property-write capability", async () => {
    const f = fixture();
    const result = f.host.requestLinkInput({ ...f.request, write: null });
    const ui = modal();
    expect(ui.input).toBeUndefined();
    expect(ui.content.texts).toEqual([expect.stringContaining("no valid write property")]);
    ui.current.close();
    await expect(result).resolves.toMatchObject({ added: [] });
  });

  it("reports partial incoming outcomes immediately, retries failed rows only and closes on completion", async () => {
    const f = fixture("incoming");
    const original = f.process.getMockImplementation()!;
    let firstFailure = true;
    f.process.mockImplementation(async (file, mutate) => {
      if (file.path === f.b.path && firstFailure) {
        firstFailure = false;
        throw new Error("Permission denied");
      }
      await original(file, mutate);
    });
    const result = f.host.requestLinkInput(f.request);
    const ui = modal();
    ui.paste("[[Clipboard/A]] [[Clipboard/B (2)]]");
    expect(ui.content.texts).toContain(`Selected notes will link to ${f.clicked.path} in their related property.`);
    ui.key("Enter");
    await vi.waitFor(() => expect(ui.content.texts.some((text) => text.includes("Permission denied"))).toBe(true));
    expect(f.progress).toHaveBeenCalledWith(f.request.write, expect.objectContaining({
      changedFilePaths: [f.a.path], added: [f.a.path], failed: [{ path: f.b.path, filePath: f.b.path, reason: "Permission denied" }]
    }));
    ui.button("Add 1 note")!.emit("click");
    await expect(result).resolves.toMatchObject({
      selected: [f.a.path, f.b.path], added: [f.a.path, f.b.path],
      changedFilePaths: [f.a.path, f.b.path], failed: []
    });
    expect(f.progress.mock.calls[1][1]).toMatchObject({ changedFilePaths: [f.b.path] });
    expect(f.process.mock.calls.map(([file]) => file.path)).toEqual([f.a.path, f.b.path, f.b.path]);
    expect(f.frontmatters.has(f.clicked.path)).toBe(false);
  });

  it("handles double Enter and closing midcommit, and settles after reporting the write", async () => {
    const f = fixture();
    const original = f.process.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    f.process.mockImplementation(async (...args) => { await gate; await original(...args); });
    const settled = vi.fn();
    const result = f.host.requestLinkInput(f.request).then(settled);
    const ui = modal();
    ui.paste("[[Clipboard/A]]");
    ui.key("Enter");
    ui.key("Enter");
    ui.key("Enter", true);
    await vi.waitFor(() => expect(f.process).toHaveBeenCalledOnce());
    ui.current.close();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(f.process).toHaveBeenCalledOnce();
    release();
    await result;
    ui.current.close();
    expect(f.progress).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ added: [f.a.path] }));
  });

  it.each([true, false])("uses membership preference %s for selection, creation and clipboard input", async (on) => {
    const f = fixture("outgoing", on);
    const reference = `[[${f.clicked.path}]]`;
    f.frontmatters.set(f.owner.path, { rootNodeProperties: ["members"], Members: [27, reference, { keep: true }] });
    const batch = f.host.requestLinkInput(f.request);
    modal().paste("[[Destination/A]]");
    modal().key("Enter");
    await expect(batch).resolves.toMatchObject({ origin: "clipboard-batch", selected: [f.local.path] });
    const ordinary = f.host.requestLinkInput(f.request);
    modal().type("Clipboard/A");
    modal().key("Enter");
    await expect(ordinary).resolves.toMatchObject({ origin: "single-note-input", selected: [f.a.path] });
    const create = f.host.requestLinkInput(f.request);
    modal().type("New note");
    modal().key("Enter");
    await expect(create).resolves.toMatchObject({ origin: "single-note-input", selected: ["Destination/New note.md"] });
    expect(f.create).toHaveBeenCalledExactlyOnceWith("Destination/New note.md", "");
    expect(f.frontmatters.get(f.owner.path)?.Members).toEqual([
      27, reference, { keep: true }, ...(on ? [`[[${f.local.path}]]`, `[[${f.a.path}]]`, "[[Destination/New note.md]]"] : [])
    ]);
    expect(f.membershipProgress).toHaveBeenCalledTimes(on ? 3 : 0);
  });

  it("requires one property choice and saves toggle changes across cancel and across open modals", async () => {
    const f = fixture();
    const reference = `[[${f.clicked.path}]]`;
    f.frontmatters.set(f.owner.path, { rootNodeProperties: ["primary", "other"], Primary: reference, Other: reference });
    const cancelled = f.host.requestLinkInput(f.request);
    modal().button(`${BADGE_MEMBERSHIP_LABEL} · On`)!.emit("click");
    modal().key("Escape");
    await cancelled;
    await vi.waitFor(() => expect(f.preference.get()).toEqual({ value: false, saving: false }));
    const result = f.host.requestLinkInput(f.request);
    const ui = modal();
    expect(ui.button(`${BADGE_MEMBERSHIP_LABEL} · Off`)).toBeDefined();
    await f.preference.set(true);
    expect(ui.button(`${BADGE_MEMBERSHIP_LABEL} · On`)).toBeDefined();
    ui.paste("[[Clipboard/A]]");
    expect(ui.button("Add 1 note")?.disabled).toBe(true);
    ui.key("Enter");
    expect(f.process).not.toHaveBeenCalled();
    const choice = ui.content.descendants().find(({ tag }) => tag === "select")!;
    choice.value = "Other";
    choice.emit("change");
    ui.button("Add 1 note")!.emit("click");
    await expect(result).resolves.toMatchObject({ membership: { destination: { property: "Other" }, items: [{ path: f.a.path, status: "added" }] } });
    expect(f.frontmatters.get(f.owner.path)).toMatchObject({ Primary: reference, Other: [reference, `[[${f.a.path}]]`] });
  });

  it.each([true, false])("retries only membership after creating the note, with preference %s at retry", async (retryOn) => {
    const f = fixture();
    f.frontmatters.set(f.owner.path, { rootNodes: `[[${f.clicked.path}]]` });
    const original = f.process.getMockImplementation()!;
    let rejectMembership = true;
    f.process.mockImplementation(async (file, mutate) => {
      if (file === f.owner && rejectMembership) {
        rejectMembership = false;
        throw new Error("Read-only membership");
      }
      await original(file, mutate);
    });
    const result = f.host.requestLinkInput(f.request);
    const ui = modal();
    ui.type("New note");
    ui.key("Enter");
    await vi.waitFor(() => expect(ui.button("Retry membership")).toBeDefined());
    expect(f.progress).toHaveBeenCalledOnce();
    if (!retryOn) {
      await f.preference.set(false);
      expect(ui.content.texts).toContain("Retry will skip unfinished graph membership.");
    }
    ui.button(retryOn ? "Retry membership" : "Finish without membership")!.emit("click");
    await expect(result).resolves.toMatchObject({
      added: ["Destination/New note.md"], membership: { items: [{ path: "Destination/New note.md", status: retryOn ? "added" : "off" }] }
    });
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.process.mock.calls.map(([file]) => file.path)).toEqual([
      f.clicked.path, f.owner.path, ...(retryOn ? [f.owner.path] : [])
    ]);
  });

  it("reports a property that disappears after preview as stale and never switches automatically", async () => {
    const f = fixture();
    const reference = `[[${f.clicked.path}]]`;
    f.frontmatters.set(f.owner.path, { rootNodeProperties: ["a", "b"], A: [reference], B: [] });
    const result = f.host.requestLinkInput(f.request);
    const ui = modal();
    ui.paste("[[Clipboard/A]]");
    f.frontmatters.set(f.owner.path, { rootNodeProperties: ["a", "b"], A: [], B: [reference] });
    ui.key("Enter");
    await vi.waitFor(() => expect(ui.content.texts).toContain(`${f.owner.path} → A (stale)`));
    expect(f.frontmatters.get(f.owner.path)).toMatchObject({ A: [], B: [reference] });
    expect(f.membershipProgress).not.toHaveBeenCalled();
    ui.key("Escape");
    await expect(result).resolves.toMatchObject({
      added: [f.a.path], membership: { destination: { property: "A" }, items: [{ path: f.a.path, status: "stale" }] }
    });
  });

  it("repairs missing membership when the primary property already contains the relationship", async () => {
    const f = fixture();
    const property = `[[${f.a.path}]]`;
    f.frontmatters.set(f.clicked.path, { related: [property] });
    f.frontmatters.set(f.owner.path, { rootNodes: `[[${f.clicked.path}]]` });
    const result = f.host.requestLinkInput(f.request);
    modal().paste(property);
    modal().key("Enter");
    await expect(result).resolves.toMatchObject({
      added: [], alreadyPresent: [f.a.path],
      membership: { items: [{ path: f.a.path, status: "added" }] }
    });
    expect(f.progress).not.toHaveBeenCalled();
    expect(f.frontmatters.get(f.clicked.path)?.related).toEqual([property]);
  });

  it("captures the saved option before commit and supports both phases on the same file and property", async () => {
    const f = fixture();
    const reference = `[[${f.clicked.path}]]`;
    f.frontmatters.set(f.clicked.path, { rootNodeProperties: ["related"], Related: [reference] });
    const original = f.process.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    f.process.mockImplementationOnce(async (...args) => { await gate; await original(...args); });
    const result = f.host.requestLinkInput({ ...f.request, membership: { kind: "note", ownerPath: f.clicked.path, referencePath: f.clicked.path } });
    modal().paste(`[[${f.a.path}]]`);
    modal().key("Enter");
    await vi.waitFor(() => expect(f.process).toHaveBeenCalledOnce());
    await f.preference.set(false);
    release();
    await expect(result).resolves.toMatchObject({
      added: [f.a.path], membership: { items: [{ path: f.a.path, status: "already-present" }], changedFilePaths: [] }
    });
    expect(f.frontmatters.get(f.clicked.path)?.Related).toEqual([reference, `[[${f.a.path}]]`]);
    expect(f.process.mock.calls.map(([file]) => file.path)).toEqual([f.clicked.path, f.clicked.path]);
  });
});
