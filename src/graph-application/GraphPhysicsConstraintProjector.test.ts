import { describe, expect, it } from "vitest";
import type { GraphTransientNodeConstraint } from "../graph-domain/GraphPhysicsConstraints";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphPhysicsConstraintProjector } from "./GraphPhysicsConstraintProjector";

function snapshot(): GraphSnapshot {
  return {
    notes: [],
    nodes: [
      {
        id: "A",
        noteId: "A.md",
        contextId: "graph:root",
        position: { x: 10, y: 20 },
        velocity: { x: 1, y: 2 },
        radius: 20,
        pinned: true,
        selected: false,
        origin: { kind: "root" }
      },
      {
        id: "B",
        noteId: "B.md",
        contextId: "graph:root",
        position: { x: 30, y: 40 },
        velocity: { x: 3, y: 4 },
        radius: 20,
        pinned: false,
        selected: true,
        origin: { kind: "root" }
      }
    ],
    edges: [],
    badges: [],
    expansions: [],
    lenses: []
  };
}

function transientConstraints(): GraphTransientNodeConstraint[] {
  return [
    {
      kind: "position-lock",
      nodeId: "A",
      reason: "pin-reposition",
      position: { x: 50, y: 60 }
    },
    {
      kind: "velocity-freeze",
      nodeId: "B",
      reason: "topology-update"
    },
    {
      kind: "drag-target",
      nodeId: "missing",
      position: { x: 900, y: 900 }
    }
  ];
}

describe("GraphPhysicsConstraintProjector", () => {
  it("derives persistent pins while preserving overlapping transient constraints", () => {
    const result = new GraphPhysicsConstraintProjector().project(snapshot(), {
      simulationFrozen: true,
      nodeConstraints: transientConstraints()
    });

    expect(result.state).toEqual({
      simulationFrozen: true,
      persistentPins: [{ nodeId: "A", position: { x: 10, y: 20 } }],
      transientNodeConstraints: [
        {
          kind: "position-lock",
          nodeId: "A",
          reason: "pin-reposition",
          position: { x: 50, y: 60 }
        },
        {
          kind: "velocity-freeze",
          nodeId: "B",
          reason: "topology-update"
        }
      ]
    });
  });

  it("reports transient constraints whose node is absent", () => {
    const result = new GraphPhysicsConstraintProjector().project(snapshot(), {
      simulationFrozen: false,
      nodeConstraints: transientConstraints()
    });

    expect(result.diagnostics.ignoredTransientConstraints).toEqual([{
      kind: "drag-target",
      nodeId: "missing",
      position: { x: 900, y: 900 }
    }]);
  });

  it("returns positions detached from both inputs", () => {
    const source = snapshot();
    const transient = transientConstraints();
    const result = new GraphPhysicsConstraintProjector().project(source, {
      simulationFrozen: false,
      nodeConstraints: transient
    });

    (result.state.persistentPins[0]!.position as { x: number }).x = 500;
    const lock = result.state.transientNodeConstraints[0];
    if (lock && "position" in lock) {
      (lock.position as { x: number }).x = 500;
    }
    const ignored = result.diagnostics.ignoredTransientConstraints[0];
    if (ignored && "position" in ignored) {
      (ignored.position as { x: number }).x = 500;
    }

    expect(source.nodes[0]?.position.x).toBe(10);
    const transientLock = transient[0];
    expect(transientLock && "position" in transientLock
      ? transientLock.position.x
      : undefined).toBe(50);
    const transientIgnored = transient[2];
    expect(transientIgnored && "position" in transientIgnored
      ? transientIgnored.position.x
      : undefined).toBe(900);
  });
});
