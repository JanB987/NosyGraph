import { describe, expect, it } from "vitest";
import type { GraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type {
  GraphRuntimeChangeSetApplyResult,
  GraphRuntimeState
} from "./GraphRuntimeState";
import type { LegacyGraphPhysicsReadState } from "./LegacyGraphPhysicsReadAdapter";
import { GraphPhysicsShadowInputService } from "./GraphPhysicsShadowInputService";

function snapshot(x = 10): GraphSnapshot {
  return {
    notes: [{ id: "A.md", path: "A.md", name: "A", availability: "available", properties: {} }],
    nodes: [{
      id: "A", noteId: "A.md", contextId: "graph:root",
      position: { x, y: 20 }, velocity: { x: 1, y: 2 }, radius: 10,
      pinned: false, selected: false, origin: { kind: "root" }
    }],
    edges: [], badges: [], expansions: [], lenses: []
  };
}

function physicsState(): LegacyGraphPhysicsReadState {
  return {
    settings: {
      simulation: { repulsionStrength: 2400 },
      activeLinkTypes: [],
      runtimeOverrides: {}
    },
    constraints: {
      simulationFrozen: false,
      focalLocks: [],
      pinRepositionLocks: [],
      dragTargets: [{ nodeId: "A", position: { x: 30, y: 40 } }],
      directionTargets: [],
      velocityFreezes: {}
    },
    containers: []
  };
}

class FakeRuntime implements GraphRuntimeState {
  readonly mode = "legacy" as const;

  constructor(public currentSnapshot: GraphSnapshot, public revision: number) {}

  getSnapshot(): GraphSnapshot {
    return this.currentSnapshot;
  }

  getStructuralRevision(): number {
    return this.revision;
  }

  applyChangeSet(
    _changeSet: GraphChangeSet,
    _expectedRevision?: number
  ): GraphRuntimeChangeSetApplyResult {
    return { applied: false, reason: "runtime-read-only", mode: this.mode };
  }
}

describe("GraphPhysicsShadowInputService", () => {
  it("composes a versioned capture without requiring a physics engine", () => {
    const runtime = new FakeRuntime(snapshot(), 7);
    const service = new GraphPhysicsShadowInputService(runtime, {
      getLegacyPhysicsReadState: physicsState
    });

    const capture = service.capture(12);

    expect(capture.input.graph).toMatchObject({
      structuralRevision: 7,
      frameSequence: 12,
      nodes: [{ id: "A", position: { x: 10, y: 20 } }]
    });
    expect(capture.input.settings.repulsionStrength).toBe(2400);
    expect(capture.input.constraints.transientNodeConstraints).toEqual([{
      nodeId: "A",
      kind: "drag-target",
      position: { x: 30, y: 40 }
    }]);
    expect(capture.diagnostics.legacy.ignoredConstraintEntryCount).toBe(0);
  });

  it("reads fresh runtime and legacy state on every capture", () => {
    const runtime = new FakeRuntime(snapshot(), 1);
    let state = physicsState();
    const service = new GraphPhysicsShadowInputService(runtime, {
      getLegacyPhysicsReadState: () => state
    });

    service.capture(0);
    runtime.currentSnapshot = snapshot(90);
    runtime.revision = 2;
    state = {
      ...state,
      settings: { ...state.settings, simulation: { centerStrength: 0.2 } }
    };
    const second = service.capture(1);

    expect(second.input.graph).toMatchObject({
      structuralRevision: 2,
      frameSequence: 1,
      nodes: [{ position: { x: 90, y: 20 } }]
    });
    expect(second.input.settings.centerStrength).toBe(0.2);
  });

  it("reports malformed legacy and stale-reference diagnostics together", () => {
    const state = physicsState();
    state.constraints.focalLocks = [{ nodeId: "", position: { x: 0, y: 0 } }];
    state.constraints.velocityFreezes = { "alt-drag": ["missing"] };
    const service = new GraphPhysicsShadowInputService(
      new FakeRuntime(snapshot(), 0),
      { getLegacyPhysicsReadState: () => state }
    );

    const capture = service.capture(0);

    expect(capture.diagnostics.legacy.ignoredConstraintEntryCount).toBe(1);
    expect(capture.diagnostics.constraints.ignoredTransientConstraints).toHaveLength(1);
  });
});
