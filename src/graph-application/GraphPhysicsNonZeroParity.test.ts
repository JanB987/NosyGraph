import { describe, expect, it } from "vitest";
import type { GraphKinematicsFrame } from "../graph-domain/GraphKinematicsFrame";
import { normalizeGraphPhysicsSettings } from "../graph-domain/GraphPhysicsSettings";
import type { GraphPhysicsShadowInputCapture } from "./GraphPhysicsShadowInputService";
import { GraphKinematicsTraceComparator } from "./GraphKinematicsTraceComparator";
import { StagedGraphPhysicsEngine } from "./StagedGraphPhysicsEngine";
import { GraphPhysicsExperimentRunner } from "./GraphPhysicsExperimentRunner";

function forceFixture(): GraphPhysicsShadowInputCapture {
  return {
    input: {
      graph: {
        structuralRevision: 14,
        frameSequence: 100,
        nodes: [
          {
            id: "A", contextId: "graph:root", position: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 }, radius: 10, pinned: false
          },
          {
            id: "B", contextId: "graph:root", position: { x: 140, y: 0 },
            velocity: { x: 0, y: 0 }, radius: 10, pinned: false
          }
        ],
        edges: [{
          id: "A-B", fromNodeId: "A", toNodeId: "B",
          linkTypeId: "parts", contextId: "graph:root"
        }]
      },
      settings: {
        ...normalizeGraphPhysicsSettings({
          repulsionStrength: 4000,
          defaultLinkDistance: 100,
          defaultLinkStrength: 0.01,
          linkPolicies: new Map([["parts", {
            activeDefinition: { preferredDistance: 100, strength: 0.01 }
          }]])
        }),
        damping: 0.85
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

function legacyFrames(): GraphKinematicsFrame[] {
  return [
    {
      sequence: 100, structuralRevision: 14,
      positions: new Map([
        ["A", { x: -6.63, y: 0 }],
        ["B", { x: 146.63, y: 0 }]
      ]),
      velocities: new Map([
        ["A", { x: -6.63, y: 0 }],
        ["B", { x: 6.63, y: 0 }]
      ])
    },
    {
      sequence: 101, structuralRevision: 14,
      positions: new Map([
        ["A", { x: -18.78279, y: 0 }],
        ["B", { x: 158.78279, y: 0 }]
      ]),
      velocities: new Map([
        ["A", { x: -12.15279, y: 0 }],
        ["B", { x: 12.15279, y: 0 }]
      ])
    },
    {
      sequence: 102, structuralRevision: 14,
      positions: new Map([
        ["A", { x: -35.42335407, y: 0 }],
        ["B", { x: 175.42335407, y: 0 }]
      ]),
      velocities: new Map([
        ["A", { x: -16.64056407, y: 0 }],
        ["B", { x: 16.64056407, y: 0 }]
      ])
    }
  ];
}

describe("non-zero-step staged parity", () => {
  it("matches the characterized legacy force fixture for one and three steps", () => {
    const runner = new GraphPhysicsExperimentRunner(
      { captureArchitecturePhysicsInput: () => forceFixture() },
      () => new StagedGraphPhysicsEngine()
    );
    const expected = legacyFrames();
    const actual = runner.runSteps(100, 1, 3).frames;
    const comparator = new GraphKinematicsTraceComparator();

    const oneStep = comparator.compare(expected.slice(0, 1), actual.slice(0, 1), {
      positionTolerance: 1e-6, velocityTolerance: 1e-6
    });
    const multiStep = comparator.compare(expected, actual, {
      positionTolerance: 1e-6, velocityTolerance: 1e-6
    });

    expect(oneStep.matches).toBe(true);
    expect(multiStep.matches).toBe(true);
    expect(multiStep.maxPositionDistance).toBeLessThanOrEqual(1e-6);
    expect(multiStep.maxVelocityDistance).toBeLessThanOrEqual(1e-6);
  });
});
