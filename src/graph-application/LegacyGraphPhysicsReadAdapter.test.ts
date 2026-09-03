import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphPhysicsRuntimeInputComposer } from "./GraphPhysicsRuntimeInputComposer";
import { LegacyGraphPhysicsReadAdapter } from "./LegacyGraphPhysicsReadAdapter";

const snapshot: GraphSnapshot = {
  notes: [], nodes: [{
    id: "A", noteId: "A.md", contextId: "graph:root",
    position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, radius: 10,
    pinned: true, selected: false, origin: { kind: "root" }
  }], edges: [], badges: [], expansions: [], lenses: []
};

describe("LegacyGraphPhysicsReadAdapter", () => {
  it("builds one request consumable by the runtime-input composer", () => {
    const read = new LegacyGraphPhysicsReadAdapter({
      settings: {
        simulation: { repulsionStrength: 2500 },
        activeLinkTypes: [], runtimeOverrides: {}
      },
      constraints: {
        simulationFrozen: false,
        focalLocks: [], pinRepositionLocks: [], dragTargets: [],
        directionTargets: [{ nodeId: "A", position: { x: 120, y: 0 } }],
        velocityFreezes: {}
      },
      containers: [{
        key: "parent", kind: "parent", originNodeId: "A",
        memberNodeIds: ["A"], left: 0, top: 0, right: 100, bottom: 100
      }]
    }).getRuntimeInputRequest(snapshot, 8, 21);
    const composed = new GraphPhysicsRuntimeInputComposer().compose(read.request);

    expect(composed.input.graph).toMatchObject({
      structuralRevision: 8, frameSequence: 21
    });
    expect(composed.input.settings.repulsionStrength).toBe(2500);
    expect(composed.input.constraints.persistentPins).toHaveLength(1);
    expect(composed.input.constraints.transientNodeConstraints).toHaveLength(1);
    expect(composed.input.containers.containers).toHaveLength(1);
    expect(read.diagnostics.ignoredConstraintEntryCount).toBe(0);
  });

  it("keeps adapter and projection diagnostics separate", () => {
    const read = new LegacyGraphPhysicsReadAdapter({
      settings: { simulation: {}, activeLinkTypes: [], runtimeOverrides: {} },
      constraints: {
        simulationFrozen: false,
        focalLocks: [{ nodeId: "", position: { x: 0, y: 0 } }],
        pinRepositionLocks: [], dragTargets: [], directionTargets: [],
        velocityFreezes: { "alt-drag": ["missing"] }
      },
      containers: []
    }).getRuntimeInputRequest(snapshot, 0, 0);
    const composed = new GraphPhysicsRuntimeInputComposer().compose(read.request);

    expect(read.diagnostics.ignoredConstraintEntryCount).toBe(1);
    expect(composed.diagnostics.constraints.ignoredTransientConstraints).toHaveLength(1);
  });
});
