import { describe, expect, it } from "vitest";
import { normalizeGraphPhysicsSettings } from "./GraphPhysicsSettings";
import type { GraphPhysicsRuntimeInput } from "./GraphPhysicsRuntimeInput";
import { GraphMotionIntegrator } from "./GraphMotionIntegrator";

function input(): GraphPhysicsRuntimeInput {
  return {
    graph: {
      structuralRevision: 7,
      frameSequence: 2,
      nodes: [{
        id: "A", contextId: "graph:root", position: { x: 10, y: 20 },
        velocity: { x: 2, y: -1 }, radius: 10, pinned: false
      }],
      edges: []
    },
    settings: normalizeGraphPhysicsSettings(),
    constraints: {
      simulationFrozen: false,
      persistentPins: [],
      transientNodeConstraints: []
    },
    containers: { containers: [] }
  };
}

describe("GraphMotionIntegrator", () => {
  it("adds force, damps velocity, and advances one legacy tick", () => {
    const result = new GraphMotionIntegrator().integrate(
      input(),
      new Map([["A", { x: 2, y: 1 }]])
    );

    expect(result.frame).toMatchObject({ structuralRevision: 7 });
    expect(result.frame.velocities.get("A")).toEqual({ x: 3.4, y: 0 });
    expect(result.frame.positions.get("A")).toEqual({ x: 13.4, y: 20 });
    expect(result.maxVelocity).toBe(3.4);
    expect(result.outcomes.get("A")).toBe("integrated");
  });

  it("keeps the whole frame unchanged while the simulation is frozen", () => {
    const value = input();
    value.constraints.simulationFrozen = true;
    const result = new GraphMotionIntegrator().integrate(
      value,
      new Map([["A", { x: 100, y: 100 }]])
    );

    expect(result.frame.positions.get("A")).toEqual({ x: 10, y: 20 });
    expect(result.frame.velocities.get("A")).toEqual({ x: 2, y: -1 });
    expect(result.outcomes.get("A")).toBe("simulation-frozen");
  });

  it("enforces topology freeze before direction and lock targets", () => {
    const value = input();
    value.constraints.transientNodeConstraints = [
      { kind: "direction-target", nodeId: "A", position: { x: 100, y: 100 } },
      { kind: "position-lock", nodeId: "A", reason: "focal", position: { x: 50, y: 50 } },
      { kind: "velocity-freeze", nodeId: "A", reason: "topology-update" }
    ];

    const result = new GraphMotionIntegrator().integrate(value, new Map());
    expect(result.frame.positions.get("A")).toEqual({ x: 10, y: 20 });
    expect(result.frame.velocities.get("A")).toEqual({ x: 0, y: 0 });
    expect(result.outcomes.get("A")).toBe("velocity-frozen");
  });

  it("enforces direction before locks unless the node is dragged", () => {
    const value = input();
    value.constraints.persistentPins = [{ nodeId: "A", position: { x: 30, y: 30 } }];
    value.constraints.transientNodeConstraints = [
      { kind: "direction-target", nodeId: "A", position: { x: 100, y: 100 } },
      { kind: "position-lock", nodeId: "A", reason: "focal", position: { x: 50, y: 50 } }
    ];

    const direction = new GraphMotionIntegrator().integrate(value, new Map());
    expect(direction.frame.positions.get("A")).toEqual({ x: 100, y: 100 });
    expect(direction.outcomes.get("A")).toBe("direction-target");

    value.constraints.transientNodeConstraints = [
      ...value.constraints.transientNodeConstraints,
      { kind: "drag-target", nodeId: "A", position: { x: 200, y: 200 } }
    ];
    const lock = new GraphMotionIntegrator().integrate(value, new Map());
    expect(lock.frame.positions.get("A")).toEqual({ x: 50, y: 50 });
    expect(lock.outcomes.get("A")).toBe("position-lock");
  });

  it("lets active drag override lens-owner freeze and retain velocity", () => {
    const value = input();
    value.constraints.transientNodeConstraints = [
      { kind: "velocity-freeze", nodeId: "A", reason: "lens-owner" },
      { kind: "drag-target", nodeId: "A", position: { x: 80, y: 90 } }
    ];

    const result = new GraphMotionIntegrator().integrate(value, new Map());
    expect(result.frame.positions.get("A")).toEqual({ x: 80, y: 90 });
    expect(result.frame.velocities.get("A")).toEqual({ x: 2, y: -1 });
    expect(result.outcomes.get("A")).toBe("drag-target");
  });

  it("uses a transient position lock before a persistent pin", () => {
    const value = input();
    value.constraints.persistentPins = [{ nodeId: "A", position: { x: 30, y: 30 } }];
    value.constraints.transientNodeConstraints = [{
      kind: "position-lock", nodeId: "A", reason: "pin-reposition",
      position: { x: 70, y: 80 }
    }];

    const result = new GraphMotionIntegrator().integrate(value, new Map());
    expect(result.frame.positions.get("A")).toEqual({ x: 70, y: 80 });
    expect(result.outcomes.get("A")).toBe("position-lock");
  });
});
