import { describe, expect, it } from "vitest";
import { GraphContainerAnchoring, type GraphContainerAnchoringInput } from "./GraphContainerAnchoring";

function fixture(): GraphContainerAnchoringInput {
  const nodes = ["origin", "member"].map((id) => ({
    id, contextId: "root", radius: 10, pinned: false,
    position: { x: 0, y: 0 }, velocity: { x: 2, y: 3 }
  }));
  return {
    nodes,
    frame: { structuralRevision: 7,
      positions: new Map([["origin", { x: 0, y: 0 }], ["member", { x: 10, y: 20 }]]),
      velocities: new Map(nodes.map((node) => [node.id, { ...node.velocity }])) },
    containers: { containers: [{ id: "box", kind: "parent", originNodeId: "origin",
      memberNodeIds: ["member"], parentContainerIds: [],
      bounds: { left: -50, right: 50, top: -40, bottom: 40 } }] },
    anchors: new Map([["box", {
      bounds: { left: -50, right: 50, top: -40, bottom: 40 },
      anchorDirection: { x: 2, y: 0 }, lastOrigin: { x: -1, y: 0 },
      anchorVelocity: { x: 9, y: 8 }, collisionPressure: { x: 7, y: 6 }
    }]]),
    fixedCoordinates: new Map([["member", { x: 10, y: 20 }]]),
    restVelocityThreshold: 0, minimumViewportSize: 44
  };
}

const anchor = (input: GraphContainerAnchoringInput) => new GraphContainerAnchoring().anchor(input);

describe("GraphContainerAnchoring", () => {
  it("places a parent beside its origin, translating members and fixed coordinates", () => {
    const result = anchor(fixture());
    expect(result.anchors.get("box")).toEqual({
      bounds: { left: 14, right: 114, top: -40, bottom: 40 },
      anchorDirection: { x: 1, y: 0 }, lastOrigin: { x: 0, y: 0 },
      anchorVelocity: { x: 0, y: 0 }, collisionPressure: { x: 0, y: 0 }
    });
    expect(result.frame.positions.get("member")).toEqual({ x: 74, y: 20 });
    expect(result.fixedCoordinates.get("member")).toEqual({ x: 74, y: 20 });
    expect(result.frame.velocities.get("member")).toEqual({ x: 2, y: 3 });
    expect(result.frame.structuralRevision).toBe(7);
    expect(result.maxVelocity).toBe(0);
    expect(result.diagnostics.memberTranslationCount).toBe(1);
  });

  it("uses rectangle support along a normalized diagonal", () => {
    const input = fixture();
    input.anchors.get("box")!.anchorDirection = { x: -3, y: 4 };
    const bounds = anchor(input).anchors.get("box")!.bounds;
    expect((bounds.left + bounds.right) / 2).toBeCloseTo(-38.4);
    expect((bounds.top + bounds.bottom) / 2).toBeCloseTo(51.2);
  });

  it("uses the legacy near-axis cutoff and radius-dependent gap", () => {
    const input = fixture();
    input.nodes[0].radius = 30;
    input.anchors.get("box")!.anchorDirection = { x: 0, y: -2 };
    const bounds = anchor(input).anchors.get("box")!.bounds;
    expect(bounds).toEqual({ left: -50, right: 50, top: -116, bottom: -36 });
    input.anchors.get("box")!.anchorDirection = { x: 0.00001, y: 1 };
    expect(anchor(input).anchors.get("box")!.bounds.top).toBeCloseTo(36);
  });

  it("adjusts both dimensions to the supplied viewport minimum", () => {
    const input = fixture();
    input.minimumViewportSize = 88;
    input.anchors.get("box")!.bounds = { left: -5, right: 5, top: -10, bottom: 10 };
    expect(anchor(input).anchors.get("box")!.bounds).toEqual({
      left: 14, right: 102, top: -44, bottom: 44
    });
  });

  it.each([0.019, 0.02])("uses the inclusive minimum origin dead zone: %s", (movement) => {
    const input = fixture();
    input.anchors.get("box")!.lastOrigin = { x: -movement, y: 0 };
    const result = anchor(input);
    expect(result.frame.positions.get("member")!.x).toBe(movement < 0.02 ? 10 : 74);
    expect(result.anchors.get("box")!.bounds.left).toBe(14);
  });

  it.each([0.0625, 0.125])("uses the inclusive configured translation dead zone: %s", (movement) => {
    const input = fixture();
    input.restVelocityThreshold = 0.125;
    input.anchors.get("box")!.bounds = {
      left: 14 - movement, right: 114 - movement, top: -40, bottom: 40
    };
    expect(anchor(input).frame.positions.get("member")!.x).toBe(
      movement < 0.125 ? 10 : 10.125
    );
  });

  it("falls back independently for absent or nonfinite origin history", () => {
    const input = fixture();
    input.anchors.get("box")!.lastOrigin = { x: NaN };
    expect(anchor(input).frame.positions.get("member")!.x).toBe(10);
    input.anchors.get("box")!.lastOrigin = { x: Infinity, y: -1 };
    expect(anchor(input).frame.positions.get("member")!.x).toBe(74);
  });

  it.each([{ x: 10, y: null }, { x: Infinity, y: 20 }, { y: 20 }, { x: NaN }])(
    "translates only independently finite fixed axes: %o", (fixed) => {
      const input = fixture();
      input.fixedCoordinates = new Map([["member", fixed]]);
      const result = anchor(input).fixedCoordinates.get("member")!;
      expect(result.x).toEqual(Number.isFinite(fixed.x) ? Number(fixed.x) + 64 : fixed.x);
      expect(result.y).toEqual(fixed.y);
    }
  );

  it("centers embedded bounds without moving members or normalizing their direction", () => {
    const input = fixture();
    input.containers.containers = [{ ...input.containers.containers[0], kind: "embedded", gravityStrength: 0.2 }];
    input.frame.positions = new Map([["origin", { x: 100, y: 50 }], ["member", { x: 10, y: 20 }]]);
    const result = anchor(input);
    expect(result.anchors.get("box")!.bounds).toEqual({ left: 50, right: 150, top: 10, bottom: 90 });
    expect(result.anchors.get("box")!.anchorDirection).toEqual({ x: 2, y: 0 });
    expect(result.anchors.get("box")!.lastOrigin).toEqual({ x: 100, y: 50 });
    expect(result.frame.positions.get("member")).toEqual({ x: 10, y: 20 });
    expect(result.fixedCoordinates.get("member")).toEqual({ x: 10, y: 20 });
    expect(result.diagnostics.anchoredEmbeddedCount).toBe(1);
  });

  it("resets missing-origin containers but leaves bounds and history unchanged", () => {
    const input = fixture();
    input.frame.positions = new Map();
    const result = anchor(input);
    expect(result.anchors.get("box")).toEqual({ ...input.anchors.get("box"),
      anchorVelocity: { x: 0, y: 0 }, collisionPressure: { x: 0, y: 0 } });
    expect(result.diagnostics.missingOriginContainerIds).toEqual(["box"]);
  });

  it("reports missing runtime state and missing members without fabricating them", () => {
    const input = fixture();
    input.containers.containers[0].memberNodeIds = ["absent"];
    expect(anchor(input).diagnostics.missingMemberReferences).toEqual([{ containerId: "box", nodeId: "absent" }]);
    input.anchors = new Map();
    const result = anchor(input);
    expect(result.diagnostics.missingAnchorContainerIds).toEqual(["box"]);
    expect(result.anchors.size).toBe(0);
    expect(result.containers).toEqual(input.containers);
  });

  it("processes parents before embedded containers, observing translated origins", () => {
    const input = fixture();
    input.containers.containers = [{ ...input.containers.containers[0], id: "lens",
      kind: "embedded", gravityStrength: 0.2, originNodeId: "member", memberNodeIds: [] },
      ...input.containers.containers];
    input.anchors = new Map([...input.anchors, ["lens", structuredClone(input.anchors.get("box")!)]]);
    const result = anchor(input);
    expect(result.anchors.get("lens")!.lastOrigin).toEqual({ x: 74, y: 20 });
    expect(result.anchors.get("lens")!.bounds).toEqual({ left: 24, right: 124, top: -20, bottom: 60 });
  });

  it("preserves parent order and accumulates shared-member translations", () => {
    const input = fixture();
    input.containers.containers = [...input.containers.containers,
      { ...input.containers.containers[0], id: "second", originNodeId: "member" }];
    input.anchors = new Map([...input.anchors, ["second", structuredClone(input.anchors.get("box")!)]]);
    const result = anchor(input);
    expect(result.frame.positions.get("member")).toEqual({ x: 212, y: 40 });
    expect(result.anchors.get("second")!.lastOrigin).toEqual({ x: 212, y: 40 });
    expect(result.diagnostics.memberTranslationCount).toBe(2);
  });

  it("carries returned bounds and history into another pure call", () => {
    const input = fixture();
    const first = anchor(input);
    const second = anchor({ ...input, ...first });
    expect(second.frame).toEqual(first.frame);
    expect(second.anchors).toEqual(first.anchors);
    expect(second.diagnostics.memberTranslationCount).toBe(0);
    const positions = new Map(second.frame.positions);
    positions.set("origin", { x: 5, y: 0 });
    const third = anchor({ ...input, ...second, frame: { ...second.frame, positions } });
    expect(third.frame.positions.get("member")!.x).toBe(79);
    expect(third.fixedCoordinates.get("member")!.x).toBe(79);
  });

  it("preserves the legacy zero-direction degeneracy instead of inventing a direction", () => {
    const input = fixture();
    input.anchors.get("box")!.anchorDirection = { x: 0, y: 0 };
    expect(anchor(input).anchors.get("box")!.bounds.left).toBeNaN();
  });

  it("detaches all output records from input and the compatibility bounds projection", () => {
    const input = fixture();
    const before = structuredClone(input);
    const result = anchor(input);
    expect(input).toEqual(before);
    expect(result.frame.positions.get("origin")).not.toBe(input.frame.positions.get("origin"));
    expect(result.frame.velocities.get("member")).not.toBe(input.frame.velocities.get("member"));
    expect(result.fixedCoordinates.get("member")).not.toBe(input.fixedCoordinates.get("member"));
    expect(result.anchors.get("box")!.lastOrigin).not.toBe(input.anchors.get("box")!.lastOrigin);
    expect(result.containers.containers[0].memberNodeIds).not.toBe(input.containers.containers[0].memberNodeIds);
    expect(result.containers.containers[0].bounds).not.toBe(result.anchors.get("box")!.bounds);
  });
});
