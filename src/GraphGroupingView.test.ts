import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";

vi.mock("obsidian", () => ({
  FileView: class {}, Modal: class {}, Component: class {},
  TFile: class {}, TFolder: class {}, Menu: class {}, Notice: class {}
}));

import { BasesGraphView } from "./GraphView";
import { O3GraphState } from "./O3GraphState";

// Exercise the production view's persistence methods without mounting its canvas.
function viewFixture() {
  const state = new O3GraphState({ path: "Graph.md" } as TFile);
  const writeState = vi.fn(async () => true);
  const view = Object.assign(Object.create(BasesGraphView.prototype), {
    isFileMode: true,
    graphNotePersistenceEnabled: true,
    isClosingOrUnloadingGraphView: false,
    isHydratingGraphRuntime: false,
    hasCompletedInitialGraphRuntimeHydration: true,
    graphState: state,
    graphDocumentStore: { writeState },
    groupingRules: [{ property: "status", operator: "equals", value: "DONE", color: "#00cc77" }],
    groupingPersistTimer: null,
    pendingGroupingWrite: null
  });
  return { view, state, writeState };
}

describe("live GraphView grouping writes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("debounces edits and flushes the last rule state before the timer expires", async () => {
    const { view, state, writeState } = viewFixture();
    view.scheduleGroupingStateWrite();
    view.groupingRules[0].color = "#123456";
    view.scheduleGroupingStateWrite();
    await vi.advanceTimersByTimeAsync(100);
    expect(writeState).not.toHaveBeenCalled();
    await view.flushGroupingStateWrite();
    expect(writeState).toHaveBeenCalledExactlyOnceWith(state, { reason: "graph-settings" });
    expect(state.state.settings?.groupingRules?.[0].color).toBe("#123456");
    await vi.advanceTimersByTimeAsync(300);
    expect(writeState).toHaveBeenCalledTimes(1);
  });

  it("writes the captured owner if a following graph tab changes its source", async () => {
    const { view, state, writeState } = viewFixture();
    view.scheduleGroupingStateWrite();
    const other = new O3GraphState({ path: "Other.md" } as TFile);
    const otherWrite = vi.fn();
    view.graphState = other;
    view.graphDocumentStore = { writeState: otherWrite };
    await vi.advanceTimersByTimeAsync(250);
    expect(writeState).toHaveBeenCalledExactlyOnceWith(state, { reason: "graph-settings" });
    expect(otherWrite).not.toHaveBeenCalled();
    expect(other.state.settings).toBeUndefined();
  });

  it.each([
    { graphNotePersistenceEnabled: false },
    { isFileMode: false },
    { isHydratingGraphRuntime: true },
    { hasCompletedInitialGraphRuntimeHydration: false },
    { isClosingOrUnloadingGraphView: true }
  ])("does not schedule unauthorized or startup writes: %j", async (flags) => {
    const { view, state, writeState } = viewFixture();
    Object.assign(view, flags);
    view.scheduleGroupingStateWrite();
    await vi.advanceTimersByTimeAsync(300);
    expect(writeState).not.toHaveBeenCalled();
    expect(state.state.settings).toBeUndefined();
  });
});
