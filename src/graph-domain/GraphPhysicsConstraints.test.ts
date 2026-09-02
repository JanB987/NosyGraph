import { describe, expect, it } from "vitest";
import {
  copyGraphPhysicsConstraintState,
  type GraphPhysicsConstraintState
} from "./GraphPhysicsConstraints";

function constraints(): GraphPhysicsConstraintState {
  return {
    simulationFrozen: false,
    persistentPins: [{ nodeId: "A", position: { x: 10, y: 20 } }],
    transientNodeConstraints: [
      {
        kind: "position-lock",
        nodeId: "A",
        reason: "pin-reposition",
        position: { x: 30, y: 40 }
      },
      {
        kind: "velocity-freeze",
        nodeId: "B",
        reason: "topology-update"
      },
      {
        kind: "direction-target",
        nodeId: "C",
        position: { x: 120, y: 0 }
      }
    ]
  };
}

describe("GraphPhysicsConstraintState", () => {
  it("keeps persistent pin intent separate from overlapping transient state", () => {
    const state = constraints();

    expect(state.persistentPins).toEqual([
      { nodeId: "A", position: { x: 10, y: 20 } }
    ]);
    expect(state.transientNodeConstraints[0]).toEqual({
      kind: "position-lock",
      nodeId: "A",
      reason: "pin-reposition",
      position: { x: 30, y: 40 }
    });
  });

  it("represents whole-simulation freeze independently of node constraints", () => {
    const state = { ...constraints(), simulationFrozen: true };
    expect(state.simulationFrozen).toBe(true);
    expect(state.persistentPins).toHaveLength(1);
    expect(state.transientNodeConstraints).toHaveLength(3);
  });

  it("copies arrays and nested positions across the physics boundary", () => {
    const source = constraints();
    const copy = copyGraphPhysicsConstraintState(source);

    (copy.persistentPins[0]!.position as { x: number }).x = 500;
    const target = copy.transientNodeConstraints[0];
    if (target && "position" in target) {
      (target.position as { x: number }).x = 500;
    }

    expect(source.persistentPins[0]?.position.x).toBe(10);
    const originalTarget = source.transientNodeConstraints[0];
    expect(originalTarget && "position" in originalTarget
      ? originalTarget.position.x
      : undefined).toBe(30);
  });
});
