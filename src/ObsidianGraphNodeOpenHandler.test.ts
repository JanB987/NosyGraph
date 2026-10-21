import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  TFile: class MockTFile {}
}));

import { TFile, type App, type WorkspaceLeaf } from "obsidian";
import { ObsidianGraphNodeOpenHandler } from "./ObsidianGraphNodeOpenHandler";

interface LeafFixture {
  leaf: WorkspaceLeaf;
  openFile: ReturnType<typeof vi.fn>;
  setViewState: ReturnType<typeof vi.fn>;
}

function createLeaf(pinned: boolean): LeafFixture {
  const openFile = vi.fn(async () => undefined);
  const setViewState = vi.fn(async () => undefined);
  const leaf = {
    getViewState: () => ({ type: "markdown", pinned }),
    openFile,
    setViewState
  } as unknown as WorkspaceLeaf;
  return { leaf, openFile, setViewState };
}

function createTarget(path = "Target.md"): TFile {
  return Object.assign(Object.create(TFile.prototype) as TFile, {
    path,
    extension: "md"
  });
}

function createApp(target: TFile, unpinnedLeaf: WorkspaceLeaf, newTabLeaf: WorkspaceLeaf) {
  const getLeaf = vi.fn((kind?: unknown) => kind === false ? unpinnedLeaf : newTabLeaf);
  const setActiveLeaf = vi.fn();
  const app = {
    vault: {
      getAbstractFileByPath: vi.fn(() => target)
    },
    workspace: {
      getLeaf,
      setActiveLeaf
    }
  } as unknown as App;
  return { app, getLeaf, setActiveLeaf };
}

describe("ObsidianGraphNodeOpenHandler", () => {
  it("reuses an existing unpinned leaf for an ordinary target from a pinned graph", async () => {
    const source = createLeaf(true);
    const destination = createLeaf(false);
    const newTab = createLeaf(false);
    const target = createTarget();
    const { app, getLeaf, setActiveLeaf } = createApp(target, destination.leaf, newTab.leaf);
    const openGraphInLeaf = vi.fn(async () => undefined);

    await new ObsidianGraphNodeOpenHandler(app, {
      sourceLeaf: source.leaf,
      isGraphCapable: () => false,
      openGraphInLeaf
    }).openNode({ nodeId: "node-1", path: target.path, newTab: false });

    expect(getLeaf).toHaveBeenCalledTimes(1);
    expect(getLeaf).toHaveBeenCalledWith(false);
    expect(destination.setViewState).toHaveBeenCalledWith({
      type: "markdown",
      state: { file: target.path },
      active: true
    }, true);
    expect(newTab.setViewState).not.toHaveBeenCalled();
    expect(openGraphInLeaf).not.toHaveBeenCalled();
    expect(setActiveLeaf).toHaveBeenCalledWith(destination.leaf, { focus: true });
  });

  it("reuses an existing unpinned leaf for a graph-capable target from a pinned graph", async () => {
    const source = createLeaf(true);
    const destination = createLeaf(false);
    const newTab = createLeaf(false);
    const target = createTarget("Graph capable.md");
    const { app, getLeaf, setActiveLeaf } = createApp(target, destination.leaf, newTab.leaf);
    const openGraphInLeaf = vi.fn(async () => undefined);

    await new ObsidianGraphNodeOpenHandler(app, {
      sourceLeaf: source.leaf,
      isGraphCapable: () => true,
      openGraphInLeaf
    }).openNode({ nodeId: "node-2", path: target.path, newTab: false });

    expect(getLeaf).toHaveBeenCalledTimes(1);
    expect(getLeaf).toHaveBeenCalledWith(false);
    expect(openGraphInLeaf).toHaveBeenCalledWith(destination.leaf, target.path);
    expect(destination.setViewState).not.toHaveBeenCalled();
    expect(setActiveLeaf).toHaveBeenCalledWith(destination.leaf, { focus: true });
  });

  it("uses a newly created tab only for an explicit new-tab request", async () => {
    const source = createLeaf(true);
    const destination = createLeaf(false);
    const newTab = createLeaf(false);
    const target = createTarget();
    const { app, getLeaf, setActiveLeaf } = createApp(target, destination.leaf, newTab.leaf);

    await new ObsidianGraphNodeOpenHandler(app, {
      sourceLeaf: source.leaf,
      isGraphCapable: () => false,
      openGraphInLeaf: async () => undefined
    }).openNode({ nodeId: "node-3", path: target.path, newTab: true });

    expect(getLeaf).toHaveBeenCalledTimes(1);
    expect(getLeaf).toHaveBeenCalledWith("tab");
    expect(newTab.setViewState).toHaveBeenCalledWith({
      type: "markdown",
      state: { file: target.path },
      active: true
    }, true);
    expect(destination.setViewState).not.toHaveBeenCalled();
    expect(setActiveLeaf).toHaveBeenCalledWith(newTab.leaf, { focus: true });
  });

  it("never replaces the pinned source if Obsidian unexpectedly returns it", async () => {
    const source = createLeaf(true);
    const newTab = createLeaf(false);
    const target = createTarget();
    const getLeaf = vi.fn((kind?: unknown) => kind === false ? source.leaf : newTab.leaf);
    const app = {
      vault: { getAbstractFileByPath: vi.fn(() => target) },
      workspace: { getLeaf, setActiveLeaf: vi.fn() }
    } as unknown as App;

    await new ObsidianGraphNodeOpenHandler(app, {
      sourceLeaf: source.leaf,
      isGraphCapable: () => false,
      openGraphInLeaf: async () => undefined
    }).openNode({ nodeId: "node-4", path: target.path, newTab: false });

    expect(getLeaf.mock.calls).toEqual([[false], ["tab"]]);
    expect(source.setViewState).not.toHaveBeenCalled();
    expect(newTab.setViewState).toHaveBeenCalled();
  });
});
