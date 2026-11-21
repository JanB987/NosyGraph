import { describe, expect, it, vi } from "vitest";
import { GraphStore } from "./GraphStore";
import { GraphTabSourceRegistry } from "./GraphTabSourceRegistry";
import { canLinkGraphTab, GraphTabTransitions, graphTabMarkdownTarget, graphTabSelection, readGraphTabSession } from "./GraphTabSession";
import { graphTabLeafId, resolveGraphTabLeaf } from "../ObsidianGraphTabIdentity";

describe("Graph Tab session", () => {
  it("defaults a legacy workspace and keeps the selected Markdown file separate from its graph", () => {
    const session = readGraphTabSession({ graphTab: true, file: "G.md" }, "graph", () => "session");
    expect(session).toMatchObject({ mode: "graph", binding: { kind: "automatic" }, graphSourcePath: "G.md" });
    expect(graphTabMarkdownTarget(session, () => true)).toBe("G.md");
    session.selection = graphTabSelection([
      { nodeId: "lens/child-1", path: "folder-one/A.md" },
      { nodeId: "property/child-2", path: "folder-one/A.md" },
      { nodeId: "discovered/child-3", path: "folder-two/A.md" }
    ], "discovered/child-3");
    expect(session.selection.notes).toEqual([
      { path: "folder-one/A.md", instanceIds: ["lens/child-1", "property/child-2"] },
      { path: "folder-two/A.md", instanceIds: ["discovered/child-3"] }
    ]);
    expect(graphTabMarkdownTarget(session, () => true)).toBe("folder-two/A.md");
    session.activeMarkdownPath = "folder-one/A.md";
    expect(graphTabMarkdownTarget(session, () => true)).toBe("folder-one/A.md");
    expect(graphTabMarkdownTarget(session, path => path.startsWith("folder-two"))).toBe("folder-two/A.md");
    expect(graphTabMarkdownTarget(session, path => path === "G.md")).toBeNull();
    const restored = readGraphTabSession({ file: "folder-one/A.md", graphTabSession: session }, "markdown", () => "new");
    expect(restored).toMatchObject({ sessionId: "session", graphSourcePath: "G.md", activeMarkdownPath: "folder-one/A.md" });
  });

  it("fails closed on malformed linked state and rejects direct and transitive cycles", () => {
    expect(readGraphTabSession({ graphTabSession: { binding: { kind: "linked" } } }, "graph", () => "new").binding)
      .toEqual({ kind: "linked", sourceTabId: "", labelHint: "" });
    const chain: Record<string, string | undefined> = { A: "B", B: "C", D: "E", E: "D" };
    const next = (id: string) => chain[id];
    expect(canLinkGraphTab("C", "A", next)).toBe(false);
    expect(canLinkGraphTab("C", "C", next)).toBe(false);
    expect(canLinkGraphTab("X", "D", next)).toBe(false);
    expect(canLinkGraphTab("X", "A", next)).toBe(true);
  });

  it("never resolves a duplicate-file tab or an unverifiable identity", () => {
    const a = { id: "a", file: "same.md" };
    const b = { id: "b", file: "same.md" };
    const tabs = new Map([["a", a], ["b", b]]);
    const lookup = (key: string) => tabs.get(key) ?? null;
    expect(graphTabLeafId(a, lookup)).toBe("a");
    expect(graphTabLeafId({ ...a }, lookup)).toBeNull();
    expect(graphTabLeafId({ id: 4, file: "same.md" }, () => null)).toBeNull();
    expect(graphTabLeafId({ file: "same.md" }, () => null)).toBeNull();
    tabs.delete("a");
    expect(resolveGraphTabLeaf("a", lookup)).toBeNull();
    expect(resolveGraphTabLeaf("b", lookup)).toBe(b);
  });

  it("serializes saves and applies only the newest request after a save", async () => {
    const transitions = new GraphTabTransitions();
    const commits: string[] = [];
    let release!: () => void;
    const save = new Promise<void>(resolve => { release = resolve; });
    const first = transitions.submit(async current => {
      await save;
      if (current()) commits.push("A");
    });
    await Promise.resolve();
    const second = transitions.submit(async () => { commits.push("B"); });
    const third = transitions.submit(async () => { commits.push("C"); });
    release();
    await Promise.all([first, second, third]);
    expect(commits).toEqual(["C"]);
    await expect(transitions.submit(async () => { throw Error("save failed"); })).rejects.toThrow("save failed");
    await transitions.submit(async () => { commits.push("retry"); });
    expect(commits).toEqual(["C", "retry"]);
  });
});

describe("Graph Tab live selection boundary", () => {
  it("reports all selection commands and removal through one subscription", () => {
    const store = new GraphStore();
    const onSelection = vi.fn(() => store.getSelectedNodeIds());
    const unsubscribe = store.subscribeSelection(onSelection);
    store.selectOnly("A");
    store.selectOnly("A");
    store.toggleSelection("lens-A");
    store.replaceSelection(["lens-A", "expansion-B"]);
    store.replaceSelection(["lens-A"]);
    store.clearSelection();
    unsubscribe();
    store.selectOnly("A");
    expect(onSelection.mock.results.map(result => result.value)).toEqual([
      ["A"], ["A", "lens-A"], ["lens-A", "expansion-B"], ["lens-A"], []
    ]);
    expect(onSelection.mock.calls[1]).toEqual(["lens-A"]);
  });

  it("keeps inactive selections, prefers genuine interactions, and invalidates old embed context", () => {
    const registry = new GraphTabSourceRegistry<string>();
    const a = Symbol(), b = Symbol(), embed = Symbol();
    const selection = graphTabSelection([{ path: "chosen.md", nodeId: "lens:chosen" }]);
    registry.publish(a, "tabA", "graph", { ownerPath: "a.md", graphPath: "a.md", selection }, true);
    registry.publish(b, "tabB", "graph", { ownerPath: "b.md", graphPath: "b.md", selection: null }, false);
    expect(registry.automatic()?.tab).toBe("tabA");
    expect(registry.forTab("tabB", "b.md", "graph")?.selection).toBeNull();
    const empty = graphTabSelection([]);
    registry.publish(b, "tabB", "graph", { ownerPath: "b.md", graphPath: "b.md", selection: empty }, true);
    expect(registry.automatic()?.selection).toEqual(empty);
    expect(registry.forTab("tabA", "a.md", "graph")?.selection).toEqual(selection);
    registry.publish(embed, "tabA", "embed", { ownerPath: "host.md", graphPath: "G.md", selection }, true);
    expect(registry.forTab("tabA", "other.md", "embed")).toBeUndefined();
    registry.rename("chosen.md", "renamed/chosen.md");
    expect(registry.automatic()?.selection?.notes[0].path).toBe("renamed/chosen.md");
    registry.prune(surface => surface.ownerPath !== "host.md");
    expect(registry.automatic()).toBeUndefined();
  });
});
