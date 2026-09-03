import { describe, expect, it } from "vitest";
import { normalizeGraphPhysicsSettings } from "../graph-domain/GraphPhysicsSettings";
import type { GraphPhysicsRuntimeInput } from "../graph-domain/GraphPhysicsRuntimeInput";
import { StagedGraphPhysicsEngine } from "./StagedGraphPhysicsEngine";

function input(): GraphPhysicsRuntimeInput {
  return {
    graph: {
      structuralRevision: 4, frameSequence: 0,
      nodes: [
        { id: "A", contextId: "graph:root", position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, radius: 10, pinned: false },
        { id: "B", contextId: "graph:root", position: { x: 140, y: 0 }, velocity: { x: 0, y: 0 }, radius: 10, pinned: false }
      ],
      edges: [{ id: "A-B", fromNodeId: "A", toNodeId: "B", linkTypeId: "parts", contextId: "graph:root" }]
    },
    settings: normalizeGraphPhysicsSettings({
      repulsionStrength: 4000,
      linkPolicies: new Map([["parts", { activeDefinition: { preferredDistance: 100, strength: 0.01 } }]])
    }),
    constraints: { simulationFrozen: false, persistentPins: [], transientNodeConstraints: [] },
    containers: { containers: [] }
  };
}

describe("StagedGraphPhysicsEngine", () => {
  it("composes force, damping, and one-tick integration", () => {
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(input());
    engine.start();
    const frame = engine.step(1);
    expect(frame.structuralRevision).toBe(4);
    expect(frame.velocities.get("A")?.x).toBeCloseTo(-6.63);
    expect(frame.positions.get("A")?.x).toBeCloseTo(-6.63);
    expect(frame.velocities.get("B")?.x).toBeCloseTo(6.63);
    expect(engine.getLastStepDiagnostics()?.integration.maxVelocity).toBeCloseTo(6.63);
  });

  it("uses zero delta for inspection and any positive delta for one legacy tick", () => {
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(input());
    engine.start();
    expect(engine.step(0).positions.get("A")?.x).toBe(0);
    const first = engine.step(0.1).positions.get("A")?.x;
    const second = engine.step(10).positions.get("A")?.x;
    expect(first).not.toBe(0);
    expect(second).not.toBe(first);
  });

  it("applies parent confinement after integration", () => {
    const value = input();
    value.containers = { containers: [{
      id: "parent", kind: "parent", originNodeId: "B", memberNodeIds: ["A"],
      bounds: { left: 0, top: 0, right: 100, bottom: 100 }, parentContainerIds: []
    }] };
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    const frame = engine.step(1);
    expect(frame.positions.get("A")).toEqual({ x: 20, y: 28 });
    expect(frame.velocities.get("A")).toEqual({ x: 0, y: 0 });
  });

  it("honors frozen input and returns detached position commands", () => {
    const value = input();
    value.constraints.simulationFrozen = true;
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    expect(engine.getStatus()).toBe("frozen");
    expect(engine.setNodePosition("missing", { x: 1, y: 2 })).toBe(false);
    expect(engine.setNodePosition("A", { x: 5, y: 6 })).toBe(true);
    const frame = engine.step(0);
    (frame.positions.get("A") as { x: number }).x = 500;
    expect(engine.step(0).positions.get("A")).toEqual({ x: 5, y: 6 });
  });
});
