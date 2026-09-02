import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { DeterministicGraphPhysicsEngine } from "./GraphPhysicsEngine";
import { GraphPhysicsRuntimeInputComposer } from "./GraphPhysicsRuntimeInputComposer";

function input(frozen = false) {
  const snapshot: GraphSnapshot = {
    notes: [],
    nodes: [{
      id: "A", noteId: "A.md", contextId: "graph:root",
      position: { x: 10, y: 20 }, velocity: { x: 2, y: -1 },
      radius: 10, pinned: false, selected: false, origin: { kind: "root" }
    }],
    edges: [], badges: [], expansions: [], lenses: []
  };
  return new GraphPhysicsRuntimeInputComposer().compose({
    snapshot, structuralRevision: 7, frameSequence: 3,
    transientConstraints: { simulationFrozen: frozen, nodeConstraints: [] },
    containers: { containers: [] }
  }).input;
}

describe("DeterministicGraphPhysicsEngine", () => {
  it("implements explicit lifecycle and deterministic linear steps", () => {
    const engine = new DeterministicGraphPhysicsEngine();
    engine.setInput(input());
    expect(engine.getStatus()).toBe("stopped");
    engine.start();
    expect(engine.step(2).positions.get("A")).toEqual({ x: 14, y: 18 });
    engine.freeze();
    expect(engine.step(2).positions.get("A")).toEqual({ x: 14, y: 18 });
    engine.resume();
    expect(engine.step(1).positions.get("A")).toEqual({ x: 16, y: 17 });
    engine.stop();
    expect(engine.getStatus()).toBe("stopped");
  });

  it("preserves structural revision and returns detached frames", () => {
    const engine = new DeterministicGraphPhysicsEngine();
    engine.setInput(input());
    const frame = engine.step(0);
    expect(frame.structuralRevision).toBe(7);
    (frame.positions.get("A") as { x: number }).x = 500;
    expect(engine.step(0).positions.get("A")?.x).toBe(10);
  });

  it("honors frozen input and rejects unknown position targets", () => {
    const engine = new DeterministicGraphPhysicsEngine();
    engine.setInput(input(true));
    engine.start();
    expect(engine.getStatus()).toBe("frozen");
    expect(engine.setNodePosition("missing", { x: 1, y: 1 })).toBe(false);
    expect(engine.setNodePosition("A", { x: 30, y: 40 })).toBe(true);
    expect(engine.step(1).positions.get("A")).toEqual({ x: 30, y: 40 });
  });

  it("matches legacy reheat behavior for positive versus non-positive amounts", () => {
    const engine = new DeterministicGraphPhysicsEngine();
    engine.setInput(input());
    engine.reheat(0);
    expect(engine.getStatus()).toBe("stopped");
    engine.reheat(0.01);
    expect(engine.getStatus()).toBe("running");
  });
});
