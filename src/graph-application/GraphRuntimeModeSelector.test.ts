import { describe, expect, it } from "vitest";
import { createEmptyGraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { LegacyGraphRuntimeState } from "./LegacyGraphRuntimeState";
import { GraphRuntimeModeSelector, type GraphRuntimeHandle } from "./GraphRuntimeModeSelector";
import { StoreGraphRuntimeState } from "./StoreGraphRuntimeState";
import { GraphStore } from "./GraphStore";

function snapshot(name = "A"): GraphSnapshot {
  return {
    notes: [{
      id: "A.md",
      path: "A.md",
      name,
      availability: "available",
      properties: {}
    }],
    nodes: [{
      id: "root:A",
      noteId: "A.md",
      contextId: "graph:root",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 20,
      pinned: false,
      selected: false,
      origin: { kind: "root" }
    }],
    badges: [],
    edges: [],
    expansions: [],
    lenses: []
  };
}

function noteChange(name: string) {
  const changeSet = createEmptyGraphChangeSet({
    kind: "badge-expand",
    badgeId: "root:A::parts",
    expansionId: "root:A::parts"
  });
  changeSet.notes = {
    upsert: [{ ...snapshot().notes[0]!, name }],
    removeIds: []
  };
  return changeSet;
}

describe("GraphRuntimeModeSelector", () => {
  it("defaults to a legacy runtime and prevents switching while open", async () => {
    const calls: string[] = [];
    const closeCounts = { legacy: 0, store: 0 };
    const source = snapshot();
    const selector = new GraphRuntimeModeSelector({
      factories: {
        createLegacy: (path) => {
          calls.push(`legacy:${path}`);
          const state = new LegacyGraphRuntimeState(
            { getSnapshot: () => source },
            { getStructuralRevision: () => 0 }
          );
          return handle("legacy", path, state, () => { closeCounts.legacy += 1; });
        },
        createStore: (path) => {
          calls.push(`store:${path}`);
          return handle(
            "store",
            path,
            new StoreGraphRuntimeState(new GraphStore(snapshot())),
            () => { closeCounts.store += 1; }
          );
        }
      }
    });

    const opened = await selector.open("\\Graph.md\\");
    expect(opened).toMatchObject({ ok: true, handle: { mode: "legacy", path: "/Graph.md/" } });
    expect(calls).toEqual(["legacy:/Graph.md/"]);
    expect(await selector.open("Graph.md", "store")).toEqual({
      ok: false,
      reason: "runtime-already-open",
      mode: "legacy",
      path: "Graph.md"
    });
    expect(calls).toHaveLength(1);

    await selector.close();
    expect(closeCounts).toEqual({ legacy: 1, store: 0 });
    expect(selector.getActive()).toBeUndefined();
  });

  it("requires an explicit store trial flag", async () => {
    const selector = new GraphRuntimeModeSelector({
      factories: {
        createLegacy: () => { throw new Error("not expected"); },
        createStore: () => { throw new Error("not expected"); }
      }
    });

    await expect(selector.open("Graph.md", "store")).resolves.toEqual({
      ok: false,
      reason: "store-trial-disabled",
      mode: "store",
      path: "Graph.md"
    });
    expect(() => new GraphRuntimeModeSelector({
      defaultMode: "store",
      factories: {
        createLegacy: () => { throw new Error("not expected"); },
        createStore: () => { throw new Error("not expected"); }
      }
    })).toThrow("Store runtime trials must be explicitly enabled");
  });

  it("rolls back by closing store mode and creating a fresh legacy runtime", async () => {
    const calls: string[] = [];
    const closeCounts = { legacy: 0, store: 0 };
    const legacySource = snapshot();
    let storeState: StoreGraphRuntimeState | undefined;
    const selector = new GraphRuntimeModeSelector({
      storeTrialEnabled: true,
      factories: {
        createLegacy: (path) => {
          calls.push(`legacy:${path}`);
          return handle(
            "legacy",
            path,
            new LegacyGraphRuntimeState(
              { getSnapshot: () => legacySource },
              { getStructuralRevision: () => 0 }
            ),
            () => { closeCounts.legacy += 1; }
          );
        },
        createStore: (path) => {
          calls.push(`store:${path}`);
          storeState = new StoreGraphRuntimeState(new GraphStore(snapshot()));
          return handle("store", path, storeState, () => { closeCounts.store += 1; });
        }
      }
    });

    const trial = await selector.open("Graph.md", "store");
    expect(trial.ok).toBe(true);
    if (!trial.ok || !storeState) throw new Error("Expected store trial");
    expect(trial.handle.state.mode).toBe("store");
    expect(storeState.applyChangeSet(noteChange("Trial change"), 0)).toMatchObject({ applied: true });
    expect(storeState.getSnapshot().notes[0]?.name).toBe("Trial change");

    const rollback = await selector.rollbackToLegacy();
    expect(rollback).toMatchObject({ ok: true, handle: { mode: "legacy", path: "Graph.md" } });
    expect(closeCounts).toEqual({ legacy: 0, store: 1 });
    expect(calls).toEqual(["store:Graph.md", "legacy:Graph.md"]);
    expect(selector.getActive()?.mode).toBe("legacy");
    expect(selector.getActive()?.state.getSnapshot().notes[0]?.name).toBe("A");
    expect(legacySource.notes[0]?.name).toBe("A");

    await selector.close();
    expect(closeCounts).toEqual({ legacy: 1, store: 1 });
  });

  it("reports invalid paths and factory mode mismatches", async () => {
    const selector = new GraphRuntimeModeSelector({
      storeTrialEnabled: true,
      factories: {
        createLegacy: (path) => handle(
          "store",
          path,
          new StoreGraphRuntimeState(new GraphStore(snapshot())),
          () => {}
        ),
        createStore: (path) => handle(
          "store",
          `${path}/other`,
          new StoreGraphRuntimeState(new GraphStore(snapshot())),
          () => {}
        )
      }
    });

    await expect(selector.open(" ")).resolves.toEqual({
      ok: false,
      reason: "invalid-path",
      path: ""
    });
    await expect(selector.open("Graph.md", "legacy")).resolves.toMatchObject({
      ok: false,
      reason: "factory-mode-mismatch",
      mode: "legacy",
      path: "Graph.md"
    });
    await expect(selector.open("Graph.md", "store")).resolves.toMatchObject({
      ok: false,
      reason: "factory-mode-mismatch",
      mode: "store",
      path: "Graph.md"
    });
    expect(selector.getActive()).toBeUndefined();
  });
});

function handle(
  mode: "legacy" | "store",
  path: string,
  state: LegacyGraphRuntimeState | StoreGraphRuntimeState,
  close: () => void
): GraphRuntimeHandle {
  return { mode, path, state, close };
}