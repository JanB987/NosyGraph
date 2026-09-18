import { describe, expect, it, vi } from "vitest";
import type { GraphPhysicsExperimentResult } from "./GraphPhysicsExperimentRunner";
import type { LegacyGraphKinematicsReadResult } from "./LegacyGraphKinematicsAdapter";
import { GraphPhysicsParityService } from "./GraphPhysicsParityService";

function legacy(): LegacyGraphKinematicsReadResult {
  return {
    frame: {
      sequence: 3,
      structuralRevision: 5,
      positions: new Map([["A", { x: 10, y: 20 }]]),
      velocities: new Map([["A", { x: 2, y: -1 }]])
    },
    diagnostics: { ignoredBlankNodeCount: 0, duplicateNodeIds: [] }
  };
}

function experiment(x = 10): GraphPhysicsExperimentResult {
  return {
    input: {
      structuralRevision: 5, frameSequence: 3, nodeCount: 1, edgeCount: 0,
      linkPolicyCount: 0, simulationFrozen: false, persistentPinCount: 0,
      positionLockCount: 0, dragTargetCount: 0, directionTargetCount: 0,
      velocityFreezeCount: 0, parentContainerCount: 0, embeddedContainerCount: 0,
      ignoredLegacyConstraintCount: 0, ignoredEdgeCount: 0,
      ignoredTransientConstraintCount: 0, rejectedContainerCount: 0,
      ignoredContainerMemberCount: 0, ignoredContainerParentCount: 0
    },
    frame: {
      sequence: 3,
      structuralRevision: 5,
      positions: new Map([["A", { x, y: 20 }]]),
      velocities: new Map([["A", { x: 2, y: -1 }]])
    },
    frameSummary: {
      sequence: 3, structuralRevision: 5, positionCount: 1, velocityCount: 1,
      matchedNodeCount: 1, invalidSampleCount: 0, centroidX: x, centroidY: 20,
      meanSpeed: Math.sqrt(5), maxSpeed: Math.sqrt(5)
    }
  };
}

describe("GraphPhysicsParityService", () => {
  it("compares a zero-step experiment with current legacy motion by default", () => {
    const run = vi.fn(() => experiment());
    const result = new GraphPhysicsParityService(
      { captureLegacyKinematicsFrame: () => legacy() },
      { run }
    ).compare(3);

    expect(run).toHaveBeenCalledWith(3, 0);
    expect(result.comparison.matches).toBe(true);
    expect(result.legacyFrameDiagnostics).toEqual({
      ignoredBlankNodeCount: 0,
      duplicateNodeIds: []
    });
  });

  it("forwards an explicit non-negative step and comparison tolerances", () => {
    const run = vi.fn(() => experiment(10.5));
    const result = new GraphPhysicsParityService(
      { captureLegacyKinematicsFrame: () => legacy() },
      { run }
    ).compare(3, {
      deltaTime: 2,
      positionTolerance: 0.1,
      velocityTolerance: 0.2,
      maxReportedDifferences: 1
    });

    expect(run).toHaveBeenCalledWith(3, 2);
    expect(result.comparison).toMatchObject({
      matches: false,
      differenceCount: 1,
      positionTolerance: 0.1,
      velocityTolerance: 0.2
    });
  });

  it("normalizes invalid delta time to a safe zero-step experiment", () => {
    const run = vi.fn(() => experiment());
    new GraphPhysicsParityService(
      { captureLegacyKinematicsFrame: () => legacy() },
      { run }
    ).compare(3, { deltaTime: Number.NaN });

    expect(run).toHaveBeenCalledWith(3, 0);
  });
});
