import { describe, expect, it } from "vitest";
import type { NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphSnapshotKinematicsComposer } from "./GraphSnapshotKinematicsComposer";

const nodeA = "A" as NodeInstanceId;
const nodeB = "B" as NodeInstanceId;
const removedNode = "removed" as NodeInstanceId;

function snapshot(): GraphSnapshot {
  return {
    notes: [{
      id: "A.md",
      path: "A.md",
      name: "A",
      availability: "available",
      properties: { nested: { value: 1 } }
    }],
    nodes: [node(nodeA, 10), node(nodeB, 20)],
    edges: [],
    badges: [],
    expansions: [],
    lenses: []
  };
}

function node(id: NodeInstanceId, x: number): GraphSnapshot["nodes"][number] {
  return {
    id,
    noteId: "A.md",
    contextId: "graph:root",
    position: { x, y: x },
    velocity: { x: 0, y: 0 },
    radius: 20,
    pinned: false,
    selected: false,
    origin: { kind: "root" }
  };
}

function frame(structuralRevision = 3): GraphKinematicsFrame {
  return {
    sequence: 12,
    structuralRevision,
    positions: new Map([[nodeA, { x: 100, y: 101 }]]),
    velocities: new Map([[nodeA, { x: 5, y: 6 }]])
  };
}

describe("GraphSnapshotKinematicsComposer", () => {
  it("overlays a compatible frame without changing semantic node fields", () => {
    const source = snapshot();
    const result = new GraphSnapshotKinematicsComposer().compose(source, 3, frame());
    expect(result.applied).toBe(true);
    if (!result.applied) return;

    expect(result.snapshot.nodes[0]).toEqual({
      ...source.nodes[0],
      position: { x: 100, y: 101 },
      velocity: { x: 5, y: 6 }
    });
    expect(result.snapshot.nodes[1]).toEqual(source.nodes[1]);
    expect(result.frameSequence).toBe(12);
  });

  it("uses snapshot fallbacks and reports frame entries without live nodes", () => {
    const inputFrame: GraphKinematicsFrame = {
      ...frame(),
      positions: new Map([
        [nodeA, { x: 100, y: 101 }],
        [removedNode, { x: 900, y: 900 }]
      ]),
      velocities: new Map([[removedNode, { x: 9, y: 9 }]])
    };
    const result = new GraphSnapshotKinematicsComposer().compose(snapshot(), 3, inputFrame);
    expect(result.applied).toBe(true);
    if (!result.applied) return;

    expect(result.snapshot.nodes[0]?.velocity).toEqual({ x: 0, y: 0 });
    expect(result.diagnostics).toEqual({
      updatedNodeIds: [nodeA],
      positionFallbackNodeIds: [nodeB],
      velocityFallbackNodeIds: [nodeA, nodeB],
      ignoredFrameNodeIds: [removedNode]
    });
  });

  it("rejects the complete frame when structural revisions differ", () => {
    const result = new GraphSnapshotKinematicsComposer().compose(snapshot(), 4, frame(3));

    expect(result).toMatchObject({
      applied: false,
      reason: "structural-revision-mismatch",
      snapshotStructuralRevision: 4,
      frameStructuralRevision: 3,
      frameSequence: 12
    });
    expect(result.snapshot.nodes[0]?.position).toEqual({ x: 10, y: 10 });
  });

  it("returns a detached snapshot and detached frame coordinates", () => {
    const source = snapshot();
    const inputFrame = frame();
    const result = new GraphSnapshotKinematicsComposer().compose(source, 3, inputFrame);
    if (!result.applied) throw new Error("Expected compatible frame");

    (result.snapshot.nodes[0]!.position as { x: number }).x = 500;
    const nested = result.snapshot.notes[0]!.properties.nested as { value: number };
    nested.value = 500;

    expect(source.nodes[0]?.position.x).toBe(10);
    expect((source.notes[0]?.properties.nested as { value: number }).value).toBe(1);
    expect(inputFrame.positions.get(nodeA)?.x).toBe(100);
  });
});
