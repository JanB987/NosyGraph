import { describe, expect, it, vi } from "vitest";
import type { GraphPhysicsShadowInputCapture } from "./GraphPhysicsShadowInputService";
import { GraphPhysicsShadowDiagnostics } from "./GraphPhysicsShadowDiagnostics";
import { GraphPhysicsShadowObserver } from "./GraphPhysicsShadowObserver";

function capture(nodeCount = 1): GraphPhysicsShadowInputCapture {
  return {
    input: {
      graph: {
        structuralRevision: 2,
        frameSequence: 3,
        nodes: Array.from({ length: nodeCount }, (_, index) => ({
          id: `node-${index}`,
          contextId: "graph:root",
          position: { x: index, y: 0 },
          velocity: { x: 0, y: 0 },
          radius: 10,
          pinned: false
        })),
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
        simulationFrozen: false,
        persistentPins: [],
        transientNodeConstraints: []
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

describe("GraphPhysicsShadowObserver", () => {
  it("emits one compact summary for an explicit observation", () => {
    const onObservation = vi.fn();
    const observer = new GraphPhysicsShadowObserver({ onObservation });

    const observation = observer.observe(capture());

    expect(observation.summary).toMatchObject({ nodeCount: 1, edgeCount: 0 });
    expect(observation.comparison).toBeUndefined();
    expect(onObservation).toHaveBeenCalledOnce();
    expect(onObservation).toHaveBeenCalledWith(observation);
  });

  it("includes a comparison only when the caller supplies a baseline", () => {
    const diagnostics = new GraphPhysicsShadowDiagnostics();
    const expected = diagnostics.summarize(capture(2));
    const observer = new GraphPhysicsShadowObserver({ onObservation: vi.fn() });

    const observation = observer.observe(capture(1), expected);

    expect(observation.comparison).toEqual({
      matches: false,
      differences: [{ field: "nodeCount", expected: 2, actual: 1 }]
    });
  });
});
