import { describe, expect, it } from "vitest";
import { createEmptyGraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { LegacyGraphRuntimeState } from "./LegacyGraphRuntimeState";
import { GraphStore } from "./GraphStore";
import { StoreGraphRuntimeState } from "./StoreGraphRuntimeState";

function snapshot(): GraphSnapshot {
  return {
    notes: [{
      id: "A.md",
      path: "A.md",
      name: "A",
      availability: "available",
      properties: {}
    }],
    nodes: [{
      id: "A",
      noteId: "A.md",
      contextId: "graph:root",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 20,
      pinned: false,
      selected: false,
      origin: { kind: "root" }
    }],
    edges: [],
    badges: [],
    expansions: [],
    lenses: []
  };
}

function noteChange(name: string) {
  const changeSet = createEmptyGraphChangeSet({
    kind: "badge-expand",
    badgeId: "A::parts",
    expansionId: "A::parts"
  });
  changeSet.notes = {
    upsert: [{ ...snapshot().notes[0]!, name }],
    removeIds: []
  };
  return changeSet;
}

describe("LegacyGraphRuntimeState", () => {
  it("exposes legacy snapshots and revisions without mutation authority", () => {
    let revision = 7;
    const runtime = new LegacyGraphRuntimeState(
      { getSnapshot: snapshot },
      { getStructuralRevision: () => revision }
    );

    expect(runtime.mode).toBe("legacy");
    expect(runtime.getSnapshot()).toEqual(snapshot());
    expect(runtime.getStructuralRevision()).toBe(7);
    revision = 8;
    expect(runtime.getStructuralRevision()).toBe(8);
    expect(runtime.applyChangeSet(noteChange("Changed"), 7)).toEqual({
      applied: false,
      reason: "runtime-read-only",
      mode: "legacy"
    });
    expect(runtime.getSnapshot().notes[0]?.name).toBe("A");
  });
});

describe("StoreGraphRuntimeState", () => {
  it("delegates snapshots, revisions, and atomic changes to GraphStore", () => {
    const store = new GraphStore(snapshot());
    const runtime = new StoreGraphRuntimeState(store);

    expect(runtime.mode).toBe("store");
    expect(runtime.getStructuralRevision()).toBe(0);
    expect(runtime.applyChangeSet(noteChange("Changed"), 0)).toEqual({
      applied: true,
      changeCount: 1
    });
    expect(runtime.getStructuralRevision()).toBe(1);
    expect(runtime.getSnapshot().notes[0]?.name).toBe("Changed");
  });

  it("preserves GraphStore stale-transition protection", () => {
    const runtime = new StoreGraphRuntimeState(new GraphStore(snapshot()));
    expect(runtime.applyChangeSet(noteChange("First"), 0).applied).toBe(true);

    expect(runtime.applyChangeSet(noteChange("Stale"), 0)).toEqual({
      applied: false,
      reason: "revision-mismatch",
      expectedRevision: 0,
      actualRevision: 1
    });
    expect(runtime.getSnapshot().notes[0]?.name).toBe("First");
  });
});
