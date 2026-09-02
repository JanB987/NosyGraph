import { describe, expect, it } from "vitest";
import { LegacyGraphPhysicsConstraintAdapter } from "./LegacyGraphPhysicsConstraintAdapter";

function source() {
  return {
    simulationFrozen: true,
    focalLocks: [{ nodeId: " A ", position: { x: 1, y: 2 } }],
    pinRepositionLocks: [{ nodeId: "A", position: { x: 3, y: 4 } }],
    dragTargets: [{ nodeId: "B", position: { x: 5, y: 6 } }],
    directionTargets: [{ nodeId: "C", position: { x: 120, y: 0 } }],
    velocityFreezes: {
      "topology-update": ["A"],
      "alt-drag": ["B"],
      "lens-owner": ["C"],
      "dragged-lens-descendant": ["D"]
    }
  } as const;
}

describe("LegacyGraphPhysicsConstraintAdapter", () => {
  it("maps each overloaded legacy state to an explicit variant", () => {
    const result = new LegacyGraphPhysicsConstraintAdapter(source()).getConstraintInput();
    expect(result.input.simulationFrozen).toBe(true);
    expect(result.input.nodeConstraints.map((item) => item.kind)).toEqual([
      "position-lock", "position-lock", "drag-target", "direction-target",
      "velocity-freeze", "velocity-freeze", "velocity-freeze", "velocity-freeze"
    ]);
    expect(result.input.nodeConstraints[0]).toEqual({
      kind: "position-lock", nodeId: "A", reason: "focal",
      position: { x: 1, y: 2 }
    });
  });

  it("keeps overlapping constraints rather than collapsing their reasons", () => {
    const result = new LegacyGraphPhysicsConstraintAdapter(source()).getConstraintInput();
    expect(result.input.nodeConstraints.filter((item) => item.nodeId === "A")).toHaveLength(3);
  });

  it("drops blank IDs and non-finite targets with an observable count", () => {
    const value = source();
    const result = new LegacyGraphPhysicsConstraintAdapter({
      ...value,
      focalLocks: [{ nodeId: "", position: { x: 1, y: 2 } }],
      dragTargets: [{ nodeId: "B", position: { x: Number.NaN, y: 2 } }],
      velocityFreezes: { "alt-drag": [" "] }
    }).getConstraintInput();
    expect(result.input.nodeConstraints).toEqual([
      {
        kind: "position-lock", nodeId: "A", reason: "pin-reposition",
        position: { x: 3, y: 4 }
      },
      { kind: "direction-target", nodeId: "C", position: { x: 120, y: 0 } }
    ]);
    expect(result.ignoredEntryCount).toBe(3);
  });
});
