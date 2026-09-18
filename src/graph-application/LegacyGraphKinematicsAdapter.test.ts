import { describe, expect, it } from "vitest";
import { LegacyGraphKinematicsAdapter } from "./LegacyGraphKinematicsAdapter";

describe("LegacyGraphKinematicsAdapter", () => {
  it("copies legacy positions and velocities into a versioned frame", () => {
    const position = { x: 10, y: 20 };
    const velocity = { x: 1, y: 2 };
    const result = new LegacyGraphKinematicsAdapter({
      sequence: 12,
      structuralRevision: 4,
      nodes: [{ nodeId: "A", position, velocity }]
    }).getFrame();

    expect(result.frame).toMatchObject({ sequence: 12, structuralRevision: 4 });
    expect(result.frame.positions.get("A")).toEqual(position);
    expect(result.frame.velocities.get("A")).toEqual(velocity);
    expect(result.frame.positions.get("A")).not.toBe(position);
    expect(result.frame.velocities.get("A")).not.toBe(velocity);
  });

  it("ignores blank and repeated identities deterministically", () => {
    const result = new LegacyGraphKinematicsAdapter({
      sequence: 0,
      structuralRevision: 0,
      nodes: [
        { nodeId: " ", position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
        { nodeId: "A", position: { x: 1, y: 2 }, velocity: { x: 3, y: 4 } },
        { nodeId: " A ", position: { x: 9, y: 9 }, velocity: { x: 9, y: 9 } }
      ]
    }).getFrame();

    expect(Array.from(result.frame.positions)).toEqual([["A", { x: 1, y: 2 }]]);
    expect(result.diagnostics).toEqual({
      ignoredBlankNodeCount: 1,
      duplicateNodeIds: ["A"]
    });
  });

  it("preserves non-finite motion so frame diagnostics can report it", () => {
    const result = new LegacyGraphKinematicsAdapter({
      sequence: 0,
      structuralRevision: 0,
      nodes: [{
        nodeId: "A",
        position: { x: Number.NaN, y: 0 },
        velocity: { x: 0, y: Number.POSITIVE_INFINITY }
      }]
    }).getFrame();

    expect(result.frame.positions.get("A")?.x).toBeNaN();
    expect(result.frame.velocities.get("A")?.y).toBe(Number.POSITIVE_INFINITY);
  });
});
