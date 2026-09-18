import { describe, expect, it } from "vitest";
import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphKinematicsStore } from "./GraphKinematicsStore";
import { GraphStore } from "./GraphStore";

const nodeA = "A" as NodeInstanceId;

function graphSnapshot(): GraphSnapshot {
  return {
    notes: [{
      id: "A.md",
      path: "A.md",
      name: "A",
      availability: "available",
      properties: {}
    }],
    nodes: [{
      id: nodeA,
      noteId: "A.md",
      contextId: "graph:root",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 20,
      pinned: false,
      selected: false,
      origin: { kind: "root" }
    }],
    edges: [],
    badges: [],
    expansions: [],
    lenses: []
  };
}

function frame(structuralRevision: number, x: number) {
  return {
    structuralRevision,
    positions: new Map([[nodeA, { x, y: 20 }]]),
    velocities: new Map([[nodeA, { x: 1, y: 2 }]])
  };
}

describe("GraphKinematicsStore", () => {
  it("advances frame sequence without advancing structural graph revision", () => {
    const graphStore = new GraphStore(graphSnapshot());
    const kinematics = new GraphKinematicsStore(frame(graphStore.getRevision(), 10));

    expect(kinematics.getSequence()).toBe(0);
    expect(kinematics.publishFrame(frame(graphStore.getRevision(), 30))).toEqual({
      applied: true,
      sequence: 1
    });
    expect(kinematics.getFrame().positions.get(nodeA)?.x).toBe(30);
    expect(graphStore.getRevision()).toBe(0);
  });

  it("records which structural revision produced each frame", () => {
    const graphStore = new GraphStore(graphSnapshot());
    const kinematics = new GraphKinematicsStore(frame(graphStore.getRevision(), 10));

    graphStore.selectOnly(nodeA);
    expect(graphStore.getRevision()).toBe(1);
    kinematics.publishFrame(frame(graphStore.getRevision(), 40));

    expect(kinematics.getFrame()).toMatchObject({
      sequence: 1,
      structuralRevision: 1
    });
  });

  it("rejects stale frame publication without changing the current frame", () => {
    const kinematics = new GraphKinematicsStore(frame(0, 10));
    expect(kinematics.publishFrame(frame(0, 20), 0).applied).toBe(true);

    expect(kinematics.publishFrame(frame(0, 99), 0)).toEqual({
      applied: false,
      reason: "sequence-mismatch",
      expectedSequence: 0,
      actualSequence: 1
    });
    expect(kinematics.getFrame().positions.get(nodeA)?.x).toBe(20);
  });

  it("returns detached maps and coordinate objects", () => {
    const kinematics = new GraphKinematicsStore(frame(0, 10));
    const first = kinematics.getFrame();

    (first.positions as Map<NodeInstanceId, { x: number; y: number }>).set(
      nodeA,
      { x: 500, y: 500 }
    );
    const velocity = first.velocities.get(nodeA) as { x: number; y: number };
    velocity.x = 500;

    expect(kinematics.getFrame().positions.get(nodeA)?.x).toBe(10);
    expect(kinematics.getFrame().velocities.get(nodeA)?.x).toBe(1);
  });
});
