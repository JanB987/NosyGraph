import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphKinematicsStore } from "./GraphKinematicsStore";
import { GraphPhysicsCoordinator } from "./GraphPhysicsCoordinator";
import { DeterministicGraphPhysicsEngine } from "./GraphPhysicsEngine";
import { GraphPhysicsRuntimeInputComposer } from "./GraphPhysicsRuntimeInputComposer";

function setup() {
  const snapshot: GraphSnapshot = {
    notes: [], nodes: [{
      id: "A", noteId: "A.md", contextId: "graph:root",
      position: { x: 0, y: 0 }, velocity: { x: 2, y: 1 }, radius: 10,
      pinned: false, selected: false, origin: { kind: "root" }
    }], edges: [], badges: [], expansions: [], lenses: []
  };
  const input = new GraphPhysicsRuntimeInputComposer().compose({
    snapshot, structuralRevision: 5, frameSequence: 0,
    transientConstraints: { simulationFrozen: false, nodeConstraints: [] },
    containers: { containers: [] }
  }).input;
  const kinematics = new GraphKinematicsStore({
    structuralRevision: 5,
    positions: new Map([["A", { x: 0, y: 0 }]]),
    velocities: new Map([["A", { x: 2, y: 1 }]])
  });
  const coordinator = new GraphPhysicsCoordinator(
    new DeterministicGraphPhysicsEngine(), kinematics
  );
  coordinator.setInput(input);
  return { coordinator, kinematics };
}

describe("GraphPhysicsCoordinator", () => {
  it("steps the engine and publishes a protected kinematics frame", () => {
    const { coordinator, kinematics } = setup();
    coordinator.start();
    expect(coordinator.step(2)).toEqual({ applied: true, sequence: 1 });
    expect(kinematics.getFrame().positions.get("A")).toEqual({ x: 4, y: 2 });
  });

  it("rejects a stale sequence before advancing the engine", () => {
    const { coordinator, kinematics } = setup();
    coordinator.start();
    expect(coordinator.step(1, 9)).toEqual({
      applied: false, reason: "sequence-mismatch",
      expectedSequence: 9, actualSequence: 0
    });
    expect(coordinator.step(1, 0)).toEqual({ applied: true, sequence: 1 });
    expect(kinematics.getFrame().positions.get("A")?.x).toBe(2);
  });

  it("delegates freeze and resume lifecycle", () => {
    const { coordinator, kinematics } = setup();
    coordinator.start();
    coordinator.freeze();
    coordinator.step(1);
    expect(kinematics.getFrame().positions.get("A")?.x).toBe(0);
    coordinator.resume();
    coordinator.step(1);
    expect(kinematics.getFrame().positions.get("A")?.x).toBe(2);
  });

  it("rejects an engine frame calculated for another structural revision", () => {
    class WrongRevisionEngine extends DeterministicGraphPhysicsEngine {
      override step(deltaTime: number) {
        return { ...super.step(deltaTime), structuralRevision: 99 };
      }
    }
    const { kinematics } = setup();
    const coordinator = new GraphPhysicsCoordinator(new WrongRevisionEngine(), kinematics);
    const runtimeInput = new GraphPhysicsRuntimeInputComposer().compose({
      snapshot: {
        notes: [], nodes: [], edges: [], badges: [], expansions: [], lenses: []
      },
      structuralRevision: 5, frameSequence: 0,
      transientConstraints: { simulationFrozen: false, nodeConstraints: [] },
      containers: { containers: [] }
    }).input;
    coordinator.setInput(runtimeInput);

    expect(coordinator.step(1)).toEqual({
      applied: false,
      reason: "structural-revision-mismatch",
      expectedStructuralRevision: 5,
      actualStructuralRevision: 99
    });
    expect(kinematics.getSequence()).toBe(0);
  });
});
