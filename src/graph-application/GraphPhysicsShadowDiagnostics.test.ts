import { describe, expect, it } from "vitest";
import type { GraphPhysicsShadowInputCapture } from "./GraphPhysicsShadowInputService";
import { GraphPhysicsShadowDiagnostics } from "./GraphPhysicsShadowDiagnostics";

function capture(): GraphPhysicsShadowInputCapture {
  return {
    input: {
      graph: {
        structuralRevision: 4,
        frameSequence: 9,
        nodes: [{
          id: "A", contextId: "graph:root", position: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 }, radius: 10, pinned: true
        }],
        edges: []
      },
      settings: {
        repulsionStrength: 4000, centerStrength: 0, damping: 0.85,
        nearRestVelocityThreshold: 0.08, restVelocityThreshold: 0.015,
        settleFrameCount: 24, activeFrameIntervalMs: 16,
        nearSettleFrameIntervalMs: 50,
        defaultLinkPolicy: { mode: "force", preferredDistance: 120, strength: 0.01 },
        linkPolicies: new Map([["parts", {
          mode: "force", preferredDistance: 90, strength: 0.02
        }]])
      },
      constraints: {
        simulationFrozen: false,
        persistentPins: [{ nodeId: "A", position: { x: 0, y: 0 } }],
        transientNodeConstraints: [
          { kind: "drag-target", nodeId: "A", position: { x: 1, y: 2 } },
          { kind: "velocity-freeze", nodeId: "A", reason: "alt-drag" }
        ]
      },
      containers: {
        containers: [{
          id: "lens:A", kind: "embedded", originNodeId: "A",
          memberNodeIds: ["A"], bounds: { left: 0, top: 0, right: 10, bottom: 10 },
          parentContainerIds: [], gravityStrength: 0.2
        }]
      }
    },
    diagnostics: {
      legacy: { ignoredConstraintEntryCount: 1 },
      graph: { ignoredEdgeIds: ["missing-edge"] },
      constraints: { ignoredTransientConstraints: [] },
      containers: {
        rejectedContainers: [],
        ignoredMemberReferences: [{ containerId: "lens:A", nodeId: "missing" }],
        ignoredParentReferences: []
      }
    }
  };
}

describe("GraphPhysicsShadowDiagnostics", () => {
  it("summarizes structure and issues without retaining graph entities", () => {
    const summary = new GraphPhysicsShadowDiagnostics().summarize(capture());

    expect(summary).toMatchObject({
      structuralRevision: 4,
      frameSequence: 9,
      nodeCount: 1,
      linkPolicyCount: 1,
      persistentPinCount: 1,
      dragTargetCount: 1,
      velocityFreezeCount: 1,
      embeddedContainerCount: 1,
      ignoredLegacyConstraintCount: 1,
      ignoredEdgeCount: 1,
      ignoredContainerMemberCount: 1
    });
    expect(JSON.stringify(summary)).not.toContain("missing-edge");
  });

  it("returns field-level differences between compact summaries", () => {
    const diagnostics = new GraphPhysicsShadowDiagnostics();
    const expected = diagnostics.summarize(capture());
    const actual = { ...expected, nodeCount: 2, simulationFrozen: true };

    expect(diagnostics.compare(expected, actual)).toEqual({
      matches: false,
      differences: [
        { field: "nodeCount", expected: 1, actual: 2 },
        { field: "simulationFrozen", expected: false, actual: true }
      ]
    });
    expect(diagnostics.compare(expected, { ...expected })).toEqual({
      matches: true,
      differences: []
    });
  });
});
