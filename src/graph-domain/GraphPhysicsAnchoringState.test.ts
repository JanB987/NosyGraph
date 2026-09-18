import { describe, expect, it } from "vitest";
import {
  reconcileGraphPhysicsAnchoringState,
  type GraphPhysicsAnchoringState
} from "./GraphPhysicsAnchoringState";
import type { GraphPhysicsContainerState } from "./GraphPhysicsContainers";

const anchor = (left: number) => ({
  bounds: { left, right: left + 100, top: -40, bottom: 40 },
  anchorDirection: { x: 1, y: 0 },
  lastOrigin: { x: left, y: 0 },
  anchorVelocity: { x: 3, y: 4 },
  collisionPressure: { x: 5, y: 6 }
});

const parent = (id: string, originNodeId = "A", left = 14) => ({
  id, kind: "parent" as const, originNodeId, memberNodeIds: ["B"],
  bounds: { left, right: left + 100, top: -40, bottom: 40 },
  parentContainerIds: []
});

function state(): GraphPhysicsAnchoringState {
  return {
    minimumViewportSize: 44,
    anchors: new Map([["box", anchor(24)], ["removed", anchor(200)]]),
    fixedCoordinates: new Map([
      ["A", { x: 1, y: 2 }],
      ["B", { x: 3, y: null }],
      ["removed-node", { x: 9, y: 9 }]
    ])
  };
}

function containers(): GraphPhysicsContainerState {
  return { containers: [parent("box"), parent("removed", "A", 200)] };
}

describe("reconcileGraphPhysicsAnchoringState", () => {
  it("preserves compatible evolving state and prunes removed containers/nodes", () => {
    const result = reconcileGraphPhysicsAnchoringState(
      state(),
      containers(),
      {
        minimumViewportSize: 88,
        anchors: new Map([["box", anchor(-900)], ["new", anchor(400)]]),
        fixedCoordinates: new Map([
          ["A", { x: 100, y: 100 }],
          ["C", { x: 7, y: 8 }]
        ])
      },
      { containers: [parent("box"), parent("new", "A", 400)] },
      new Set(["A", "B", "C"])
    );

    expect(result.state?.anchors.get("box")?.bounds.left).toBe(24);
    expect(result.state?.anchors.get("new")?.bounds.left).toBe(400);
    expect(result.state?.minimumViewportSize).toBe(88);
    expect(result.state?.fixedCoordinates).toEqual(new Map([
      ["A", { x: 1, y: 2 }],
      ["B", { x: 3, y: null }],
      ["C", { x: 7, y: 8 }]
    ]));
    expect(result.diagnostics).toMatchObject({
      preservedContainerIds: ["box"],
      addedContainerIds: ["new"],
      removedContainerIds: ["removed"],
      preservedFixedCoordinateNodeIds: ["A", "B"],
      addedFixedCoordinateNodeIds: ["C"],
      removedFixedCoordinateNodeIds: ["removed-node"],
      missingSeedContainerIds: []
    });
    expect(result.state).not.toBe(state());
  });

  it("resets a container when its kind or origin changes", () => {
    const result = reconcileGraphPhysicsAnchoringState(
      state(),
      containers(),
      { minimumViewportSize: 44, anchors: new Map([["box", anchor(500)]]), fixedCoordinates: new Map() },
      {
        containers: [
          { ...parent("box", "C"), kind: "parent" as const },
          { ...parent("removed"), kind: "embedded" as const, gravityStrength: 0.2 }
        ]
      },
      new Set(["A", "B", "C"])
    );
    expect(result.state?.anchors.get("box")?.bounds.left).toBe(500);
    expect(result.diagnostics.resetContainers).toEqual([
      { containerId: "box", reason: "origin-changed" },
      { containerId: "removed", reason: "missing-seed" }
    ]);
    expect(result.diagnostics.missingSeedContainerIds).toEqual(["removed"]);
  });

  it("reports missing seed state for new or changed containers", () => {
    const result = reconcileGraphPhysicsAnchoringState(
      state(),
      containers(),
      undefined,
      { containers: [parent("box"), parent("new")] },
      new Set(["A", "B"])
    );
    expect(result.state?.anchors.has("box")).toBe(true);
    expect(result.state?.anchors.has("new")).toBe(false);
    expect(result.diagnostics.missingSeedContainerIds).toEqual(["new"]);
    expect(result.diagnostics.resetContainers).toEqual([]);
  });

  it("keeps the explicit unseeded first container input blocked", () => {
    const result = reconcileGraphPhysicsAnchoringState(
      undefined,
      undefined,
      undefined,
      { containers: [parent("box")] },
      new Set(["A", "B"])
    );
    expect(result.state).toBeUndefined();
    expect(result.diagnostics.missingSeedContainerIds).toEqual(["box"]);
  });

  it("returns an empty active container map when every container is removed", () => {
    const result = reconcileGraphPhysicsAnchoringState(
      state(),
      containers(),
      undefined,
      { containers: [] },
      new Set(["A", "B"])
    );
    expect(result.state?.anchors).toEqual(new Map());
    expect(result.state?.fixedCoordinates).toEqual(new Map([
      ["A", { x: 1, y: 2 }],
      ["B", { x: 3, y: null }]
    ]));
    expect(result.diagnostics.removedContainerIds).toEqual(["box", "removed"]);
  });
});
