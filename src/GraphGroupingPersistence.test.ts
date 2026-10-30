import type { App, TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { O3GraphDocumentStore } from "./O3GraphDocumentStore";
import { O3GraphState } from "./O3GraphState";

const file = { path: "Graph.md", name: "Graph.md", basename: "Graph" } as TFile;
const defaults = [{ property: "type", operator: "exists", color: "#112233" }];
const rules = [
  { property: "status", operator: "equals", value: "DONE", color: "#00cc77" },
  { property: "tags", operator: "contains", value: "work", color: "#123456" },
  { property: "priority", operator: "exists", color: "#abcdef", colorExplicit: false,
    icon: "!", iconSourcePath: "Groups/Priority.md" }
];

function fixture() {
  const initial = {
    version: 2,
    settings: { layout: "force" },
    viewport: { x: 10, y: 20, zoom: 0.5 },
    notes: { file_1: { path: "A.md" } },
    nodes: { node_1: { noteId: "file_1", x: 12, y: 34, pinned: true, origin: { kind: "root" }, badges: {} } }
  };
  const prefix = "---\ntype: graph\n---\n# My graph\n\n";
  const suffix = "\n\nKeep these notes.\n";
  let content = prefix + "```o3graph\n" + JSON.stringify(initial) + "\n```" + suffix;
  let writes = 0;
  const app = { vault: {
    read: async () => content,
    cachedRead: async () => content,
    process: async (_file: TFile, transform: (value: string) => string) => {
      const next = transform(content);
      if (next !== content) { content = next; writes += 1; }
      return content;
    },
    modify: async (_file: TFile, next: string) => { content = next; writes += 1; }
  } } as unknown as App;
  return { app, prefix, suffix, content: () => content, writes: () => writes };
}

describe("graph-note grouping persistence", () => {
  it("saves settings rules and restores them after reopening without changing markdown or topology", async () => {
    const f = fixture();
    const store = new O3GraphDocumentStore(f.app, file, {});
    const state = await store.readState({ cached: false });
    const before = state.toPersistedState();
    state.setGroupingRules(rules);
    expect(await store.writeState(state, { reason: "graph-settings" })).toBe(true);

    const reopened = await new O3GraphDocumentStore(f.app, file, {}).readState({ cached: false });
    expect(reopened.getGroupingRules(defaults)).toEqual([
      { ...rules[0], colorExplicit: true },
      { ...rules[1], colorExplicit: true },
      rules[2]
    ]);
    const after = reopened.toPersistedState();
    expect(after.nodes).toEqual(before.nodes);
    expect(after.notes).toEqual(before.notes);
    expect(after.viewport).toEqual(before.viewport);
    expect(reopened.state.settings?.layout).toBe("force");
    expect(f.content().startsWith(f.prefix)).toBe(true);
    expect(f.content().endsWith(f.suffix)).toBe(true);
  });

  it("persists deletion of the last rule and does not resurrect defaults", async () => {
    const f = fixture();
    const store = new O3GraphDocumentStore(f.app, file, {});
    const state = await store.readState();
    state.setGroupingRules(rules);
    await store.writeState(state, { reason: "graph-settings" });
    state.setGroupingRules([]);
    await store.writeState(state, { reason: "graph-settings" });
    const reopened = await new O3GraphDocumentStore(f.app, file, {}).readState();
    expect(reopened.getGroupingRules(defaults)).toEqual([]);
    expect(reopened.state.settings?.groupingRules).toEqual([]);
  });

  it("keeps existing Group Note fallback behavior without writing on hydration", async () => {
    const f = fixture();
    const store = new O3GraphDocumentStore(f.app, file, {});
    store.beginHydration();
    const state = await store.readState();
    expect(state.getGroupingRules(defaults)).toEqual([{ ...defaults[0], colorExplicit: true }]);
    expect(state.state.settings?.groupingRules).toBeUndefined();
    expect(await store.writeState(state, { reason: "graph-settings" })).toBe(false);
    store.endHydration();
    expect(f.writes()).toBe(0);
  });

  it("keeps rules scoped to their graph note", async () => {
    const first = fixture();
    const second = fixture();
    const store = new O3GraphDocumentStore(first.app, file, {});
    const state = await store.readState();
    state.setGroupingRules(rules);
    await store.writeState(state, { reason: "graph-settings" });
    const other = await new O3GraphDocumentStore(second.app, { ...file, path: "Other.md" } as TFile, {}).readState();
    expect(other.state.settings?.groupingRules).toBeUndefined();
    expect(second.writes()).toBe(0);
  });

  it("ignores malformed rule data, keeps layout, and preserves legacy defaults", () => {
    const state = new O3GraphState(file);
    state.loadFromContent("```o3graph\n" + JSON.stringify({
      version: 2, settings: { layout: "force", groupingRules: "invalid" }
    }) + "\n```");
    expect(state.state.settings).toEqual({ layout: "force" });
    expect(state.getGroupingRules(defaults)).toHaveLength(1);
    state.setGroupingRules([null, {}, { property: " " }, ...rules]);
    expect(state.getGroupingRules([])).toHaveLength(3);
  });
});
