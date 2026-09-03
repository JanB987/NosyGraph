import { describe, expect, it, vi } from "vitest";
import type { GraphPhysicsShadowInputCapture } from "./GraphPhysicsShadowInputService";
import { DeterministicGraphPhysicsEngine } from "./GraphPhysicsEngine";
import { GraphPhysicsExperimentRunner } from "./GraphPhysicsExperimentRunner";

function capture(frozen = false): GraphPhysicsShadowInputCapture {
  return {
    input: {
      graph: {
        structuralRevision: 6, frameSequence: 0,
        nodes: [{
          id: "A", contextId: "graph:root", position: { x: 10, y: 20 },
          velocity: { x: 2, y: -1 }, radius: 10, pinned: false
        }],
        edges: []
      },
      settings: {
        repulsionStrength: 4000, centerStrength: 0, damping: 0.85,
        nearRestVelocityThreshold: 0.08, restVelocityThreshold: 0.015,
        settleFrameCount: 24, activeFrameIntervalMs: 16,
        nearSettleFrameIntervalMs: 50,
        nodeContainerInfluenceDistance: 120,
        containerContainerInfluenceDistance: 36,
        defaultLinkPolicy: { mode: "force", preferredDistance: 120, strength: 0.01 },
        linkPolicies: new Map()
      },
      constraints: {
        simulationFrozen: frozen, persistentPins: [], transientNodeConstraints: []
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

describe("GraphPhysicsExperimentRunner", () => {
  it("runs one detached replacement-engine step and stamps its sequence", () => {
    const source = {
      captureArchitecturePhysicsInput: vi.fn((sequence: number) => {
        const value = capture();
        value.input.graph.frameSequence = sequence;
        return value;
      })
    };
    const result = new GraphPhysicsExperimentRunner(source).run(11, 2);

    expect(source.captureArchitecturePhysicsInput).toHaveBeenCalledWith(11);
    expect(result.input).toMatchObject({ structuralRevision: 6, frameSequence: 11 });
    expect(result.frame).toMatchObject({ sequence: 11, structuralRevision: 6 });
    expect(result.frame.positions.get("A")).toEqual({ x: 14, y: 18 });
    expect(result.frameSummary).toMatchObject({ matchedNodeCount: 1, meanSpeed: Math.sqrt(5) });
  });

  it("uses a fresh engine for every experiment", () => {
    let engineCount = 0;
    const runner = new GraphPhysicsExperimentRunner(
      { captureArchitecturePhysicsInput: () => capture() },
      () => {
        engineCount += 1;
        return new DeterministicGraphPhysicsEngine();
      }
    );

    const first = runner.run(1, 1);
    const second = runner.run(1, 1);

    expect(engineCount).toBe(2);
    expect(first.frame.positions.get("A")).toEqual(second.frame.positions.get("A"));
  });

  it("preserves frozen input in the isolated experiment", () => {
    const result = new GraphPhysicsExperimentRunner({
      captureArchitecturePhysicsInput: () => capture(true)
    }).run(2, 10);

    expect(result.frame.positions.get("A")).toEqual({ x: 10, y: 20 });
  });
});
