import { describe, expect, it } from "vitest";
import type { GraphPhysicsShadowInputCapture } from "./GraphPhysicsShadowInputService";
import type { LegacyGraphKinematicsReadResult } from "./LegacyGraphKinematicsAdapter";
import { GraphPhysicsShadowSampleService } from "./GraphPhysicsShadowSampleService";

function inputCapture(revision: number): GraphPhysicsShadowInputCapture {
  return {
    input: {
      graph: {
        structuralRevision: revision, frameSequence: 5,
        nodes: [{
          id: "A", contextId: "graph:root", position: { x: 10, y: 20 },
          velocity: { x: 1, y: 2 }, radius: 10, pinned: false
        }],
        edges: []
      },
      settings: {
        repulsionStrength: 4000, centerStrength: 0, damping: 0.85,
        nearRestVelocityThreshold: 0.08, restVelocityThreshold: 0.015,
        settleFrameCount: 24, activeFrameIntervalMs: 16,
        nearSettleFrameIntervalMs: 50,
        defaultLinkPolicy: { mode: "force", preferredDistance: 120, strength: 0.01 },
        linkPolicies: new Map()
      },
      constraints: {
        simulationFrozen: false, persistentPins: [], transientNodeConstraints: []
      },
      containers: { containers: [] }
    },
    diagnostics: {
      legacy: { ignoredConstraintEntryCount: 0 },
      graph: { ignoredEdgeIds: [] },
      constraints: { ignoredTransientConstraints: [] },
      containers: {
        rejectedContainers: [], ignoredMemberReferences: [], ignoredParentReferences: []
      }
    }
  };
}

function frameCapture(revision: number): LegacyGraphKinematicsReadResult {
  return {
    frame: {
      sequence: 5,
      structuralRevision: revision,
      positions: new Map([["A", { x: 10, y: 20 }]]),
      velocities: new Map([["A", { x: 1, y: 2 }]])
    },
    diagnostics: { ignoredBlankNodeCount: 0, duplicateNodeIds: [] }
  };
}

describe("GraphPhysicsShadowSampleService", () => {
  it("returns compact evidence when input and frame revisions agree", () => {
    const service = new GraphPhysicsShadowSampleService(
      { captureArchitecturePhysicsInput: () => inputCapture(7) },
      { captureLegacyKinematicsFrame: () => frameCapture(7) }
    );

    expect(service.capture(5)).toMatchObject({
      status: "ready",
      input: { structuralRevision: 7, frameSequence: 5, nodeCount: 1 },
      frame: { structuralRevision: 7, sequence: 5, matchedNodeCount: 1 },
      legacyFrameDiagnostics: { ignoredBlankNodeCount: 0, duplicateNodeIds: [] }
    });
  });

  it("makes a revision race explicit instead of treating it as parity evidence", () => {
    const service = new GraphPhysicsShadowSampleService(
      { captureArchitecturePhysicsInput: () => inputCapture(7) },
      { captureLegacyKinematicsFrame: () => frameCapture(8) }
    );

    expect(service.capture(5)).toMatchObject({
      status: "revision-mismatch",
      inputStructuralRevision: 7,
      frameStructuralRevision: 8
    });
  });

  it("passes one caller sequence to both capture sources", () => {
    const seen: number[] = [];
    const service = new GraphPhysicsShadowSampleService(
      {
        captureArchitecturePhysicsInput: (sequence) => {
          seen.push(sequence);
          return inputCapture(1);
        }
      },
      {
        captureLegacyKinematicsFrame: (sequence) => {
          seen.push(sequence);
          return frameCapture(1);
        }
      }
    );

    service.capture(42);
    expect(seen).toEqual([42, 42]);
  });
});
