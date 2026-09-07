import { describe, expect, it, vi } from "vitest";
import { GraphContainerAnchoring } from "../graph-domain/GraphContainerAnchoring";
import { GraphContainerConfinement } from "../graph-domain/GraphContainerConfinement";
import { GraphForceAccumulator } from "../graph-domain/GraphForceAccumulator";
import { GraphMotionIntegrator } from "../graph-domain/GraphMotionIntegrator";
import { normalizeGraphPhysicsSettings } from "../graph-domain/GraphPhysicsSettings";
import type { GraphPhysicsRuntimeInput } from "../graph-domain/GraphPhysicsRuntimeInput";
import { StagedGraphPhysicsEngine } from "./StagedGraphPhysicsEngine";

function input(): GraphPhysicsRuntimeInput {
  return {
    graph: {
      structuralRevision: 4, frameSequence: 0,
      nodes: [
        { id: "A", contextId: "graph:root", position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, radius: 10, pinned: false },
        { id: "B", contextId: "graph:root", position: { x: 140, y: 0 }, velocity: { x: 0, y: 0 }, radius: 10, pinned: false }
      ],
      edges: [{ id: "A-B", fromNodeId: "A", toNodeId: "B", linkTypeId: "parts", contextId: "graph:root" }]
    },
    settings: normalizeGraphPhysicsSettings({
      repulsionStrength: 4000,
      linkPolicies: new Map([["parts", { activeDefinition: { preferredDistance: 100, strength: 0.01 } }]])
    }),
    constraints: { simulationFrozen: false, persistentPins: [], transientNodeConstraints: [] },
    containers: { containers: [] }
  };
}

function containerInput(): GraphPhysicsRuntimeInput {
  const value = input();
  value.graph.edges = [];
  value.graph.nodes = [
    { ...value.graph.nodes[0], position: { x: 0, y: 0 }, velocity: { x: 10, y: 0 } },
    { ...value.graph.nodes[1], position: { x: 64, y: 0 } }
  ];
  value.settings = { ...normalizeGraphPhysicsSettings({ repulsionStrength: 0 }), damping: 1 };
  const bounds = { left: 14, right: 114, top: -40, bottom: 40 };
  value.containers = { containers: [{
    id: "parent", kind: "parent", originNodeId: "A", memberNodeIds: ["B"],
    bounds, parentContainerIds: []
  }] };
  value.anchoring = {
    minimumViewportSize: 44,
    anchors: new Map([["parent", {
      bounds: { ...bounds }, anchorDirection: { x: 1, y: 0 },
      lastOrigin: { x: 0, y: 0 }, anchorVelocity: { x: 0, y: 0 },
      collisionPressure: { x: 0, y: 0 }
    }]]),
    fixedCoordinates: new Map([["B", { x: 64, y: null }]])
  };
  return value;
}

describe("StagedGraphPhysicsEngine", () => {
  it("composes force, damping, and one-tick integration", () => {
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(input());
    engine.start();
    const frame = engine.step(1);
    expect(frame.structuralRevision).toBe(4);
    expect(frame.velocities.get("A")?.x).toBeCloseTo(-6.63);
    expect(frame.positions.get("A")?.x).toBeCloseTo(-6.63);
    expect(frame.velocities.get("B")?.x).toBeCloseTo(6.63);
    expect(engine.getLastStepDiagnostics()?.integration.maxVelocity).toBeCloseTo(6.63);
  });

  it("uses zero delta for inspection and any positive delta for one legacy tick", () => {
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(input());
    engine.start();
    expect(engine.step(0).positions.get("A")?.x).toBe(0);
    const first = engine.step(0.1).positions.get("A")?.x;
    const second = engine.step(10).positions.get("A")?.x;
    expect(first).not.toBe(0);
    expect(second).not.toBe(first);
  });

  it("confines again against newly anchored bounds even without member translation", () => {
    const value = containerInput();
    value.graph.nodes[0].velocity = { x: 0, y: 0 };
    value.graph.nodes[1].position = { x: 0, y: 0 };
    value.anchoring!.anchors.get("parent")!.bounds = { left: -50, right: 50, top: -40, bottom: 40 };
    value.anchoring!.anchors.get("parent")!.lastOrigin = {};
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    const frame = engine.step(1);
    expect(frame.positions.get("B")).toEqual({ x: 34, y: 0 });
    expect(frame.velocities.get("B")).toEqual({ x: 0, y: 0 });
    expect(engine.getLastStepDiagnostics()?.confinement.correctedXCount).toBe(0);
    expect(engine.getLastStepDiagnostics()?.anchoring.memberTranslationCount).toBe(0);
    expect(engine.getLastStepDiagnostics()?.finalConfinement.correctedXCount).toBe(1);
  });

  it("runs integration, confinement, anchoring, confinement in order with current bounds", () => {
    const forces = new GraphForceAccumulator();
    const integrator = new GraphMotionIntegrator();
    const confinement = new GraphContainerConfinement();
    const anchoring = new GraphContainerAnchoring();
    const forceSpy = vi.spyOn(forces, "accumulate");
    const integrateSpy = vi.spyOn(integrator, "integrate");
    const confineSpy = vi.spyOn(confinement, "constrain");
    const anchorSpy = vi.spyOn(anchoring, "anchor");
    const engine = new StagedGraphPhysicsEngine(forces, integrator, confinement, anchoring);
    engine.setInput(containerInput());
    engine.start();
    expect(engine.step(1).positions.get("B")).toEqual({ x: 74, y: 0 });
    expect(integrateSpy.mock.invocationCallOrder[0]).toBeLessThan(confineSpy.mock.invocationCallOrder[0]);
    expect(confineSpy.mock.invocationCallOrder[0]).toBeLessThan(anchorSpy.mock.invocationCallOrder[0]);
    expect(anchorSpy.mock.invocationCallOrder[0]).toBeLessThan(confineSpy.mock.invocationCallOrder[1]);
    expect(confineSpy.mock.calls[0][2].containers[0].bounds.left).toBe(14);
    expect(confineSpy.mock.calls[1][2].containers[0].bounds.left).toBe(24);
    expect(engine.step(1).positions.get("B")).toEqual({ x: 84, y: 0 });
    expect(forceSpy.mock.calls[1][0].containers.containers[0].bounds.left).toBe(24);
    expect(confineSpy.mock.calls[2][2].containers[0].bounds.left).toBe(24);
    expect(engine.getAnchoringState()?.anchors.get("parent")?.lastOrigin).toEqual({ x: 20, y: 0 });
    expect(engine.getAnchoringState()?.fixedCoordinates.get("B")).toEqual({ x: 84, y: null });
  });

  it("does not translate again when the origin remains still on the next tick", () => {
    const value = containerInput();
    value.graph.nodes[0].velocity = { x: 0, y: 0 };
    value.anchoring!.anchors.get("parent")!.bounds = { left: -50, right: 50, top: -40, bottom: 40 };
    value.anchoring!.anchors.get("parent")!.lastOrigin = { x: -1, y: 0 };
    value.graph.nodes[1].position = { x: 0, y: 0 };
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    const first = engine.step(1);
    expect(first.positions.get("B")?.x).toBe(64);
    expect(engine.getLastStepDiagnostics()?.anchoring.memberTranslationCount).toBe(1);
    expect(engine.step(1)).toEqual(first);
    expect(engine.getLastStepDiagnostics()?.anchoring.memberTranslationCount).toBe(0);
  });

  it("confines pinned nodes only in the final pass, matching legacy early exits", () => {
    const value = containerInput();
    value.graph.nodes[0].velocity = { x: 0, y: 0 };
    value.anchoring!.anchors.get("parent")!.bounds = { left: -50, right: 50, top: -40, bottom: 40 };
    value.anchoring!.anchors.get("parent")!.lastOrigin = {};
    value.constraints.persistentPins = [{ nodeId: "B", position: { x: 100, y: 0 } }];
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    expect(engine.step(1).positions.get("B")?.x).toBe(94);
    expect(engine.getLastStepDiagnostics()?.confinement.correctedXCount).toBe(0);
    expect(engine.getLastStepDiagnostics()?.finalConfinement.correctedXCount).toBe(1);
  });

  it("retains translated fixed coordinates without rewriting independent pin targets", () => {
    const value = containerInput();
    value.constraints.persistentPins = [{ nodeId: "B", position: { x: 64, y: 0 } }];
    const before = structuredClone(value);
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    expect(engine.step(1).positions.get("B")?.x).toBe(74);
    expect(engine.step(1).positions.get("B")?.x).toBe(74);
    expect(engine.getAnchoringState()?.fixedCoordinates.get("B")?.x).toBe(84);
    expect(value).toEqual(before);
  });

  it("centers embedded containers across ticks without translating raw member coordinates", () => {
    const value = containerInput();
    value.containers.containers = [{ ...value.containers.containers[0], kind: "embedded", gravityStrength: 0 }];
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    engine.step(1);
    const frame = engine.step(1);
    expect(frame.positions.get("B")).toEqual({ x: 64, y: 0 });
    expect(engine.getAnchoringState()?.anchors.get("parent")?.bounds).toEqual({
      left: -30, right: 70, top: -40, bottom: 40
    });
    expect(engine.getAnchoringState()?.fixedCoordinates.get("B")?.x).toBe(64);
  });

  it("does not advance anchor state during inspection, stop, or freeze", () => {
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(containerInput());
    const before = engine.getAnchoringState();
    engine.step(1);
    engine.start();
    engine.step(0);
    engine.step(-1);
    engine.step(NaN);
    engine.step(Infinity);
    engine.freeze();
    engine.step(1);
    expect(engine.getAnchoringState()).toEqual(before);
    expect(engine.getLastStepDiagnostics()).toBeUndefined();
    engine.resume();
    expect(engine.step(1).positions.get("B")?.x).toBe(74);
  });

  it("requires complete explicit anchor seeds only when actually stepping containers", () => {
    const value = containerInput();
    delete value.anchoring;
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    expect(engine.step(0).positions.get("B")?.x).toBe(64);
    expect(() => engine.step(1)).toThrow("explicit anchoring seed");
    expect(engine.getLastStepDiagnostics()).toBeUndefined();
    expect(engine.step(0).positions.get("A")?.x).toBe(0);
    const incomplete = containerInput();
    incomplete.anchoring!.anchors = new Map();
    engine.setInput(incomplete);
    expect(() => engine.step(1)).toThrow("Missing anchoring state for container: parent");
    const invalid = containerInput();
    invalid.anchoring!.minimumViewportSize = NaN;
    engine.setInput(invalid);
    expect(() => engine.step(1)).toThrow("minimumViewportSize");
  });

  it("detaches state and preserves compatible motion/anchor state across setInput", () => {
    const value = containerInput();
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    value.graph.nodes[0].velocity = { x: 100, y: 0 };
    value.settings.damping = 0;
    value.anchoring!.anchors.get("parent")!.lastOrigin = { x: 999, y: 0 };
    value.anchoring!.fixedCoordinates = new Map();
    engine.start();
    expect(engine.step(1).positions.get("B")?.x).toBe(74);
    const state = engine.getAnchoringState()!;
    state.anchors.get("parent")!.bounds = { left: 999, right: 1000, top: 0, bottom: 1 };
    state.fixedCoordinates.get("B")!.x = 999;
    const diagnostics = engine.getLastStepDiagnostics()!;
    (diagnostics.anchoring.missingOriginContainerIds as string[]).push("fake");
    (diagnostics.finalConfinement.missingSampleNodeIds as string[]).push("fake");
    expect(engine.getLastStepDiagnostics()?.anchoring.missingOriginContainerIds).toEqual([]);
    expect(engine.getLastStepDiagnostics()?.finalConfinement.missingSampleNodeIds).toEqual([]);
    expect(engine.step(1).positions.get("B")?.x).toBe(84);
    expect(engine.getAnchoringState()?.fixedCoordinates.get("B")?.x).toBe(84);
    const updated = containerInput();
    updated.graph.structuralRevision = 5;
    updated.graph.nodes = updated.graph.nodes.map((node) => ({
      ...node, position: { x: node.position.x + 1000, y: node.position.y + 1000 }
    }));
    engine.setInput(updated);
    expect(engine.getLastStepDiagnostics()).toBeUndefined();
    expect(engine.step(1).positions.get("B")?.x).toBe(94);
    engine.setInput(input());
    expect(engine.getAnchoringState()?.anchors.size).toBe(0);
    expect(engine.getAnchoringState()?.fixedCoordinates.size).toBe(1);
  });

  it("reconciles added, removed, and changed containers across structural updates", () => {
    const engine = new StagedGraphPhysicsEngine();
    const first = containerInput();
    engine.setInput(first);
    engine.start();
    engine.step(1);
    const changed = containerInput();
    changed.graph.structuralRevision = 5;
    changed.graph.nodes = [
      changed.graph.nodes[0],
      { ...changed.graph.nodes[1], id: "C", position: { x: 80, y: 0 } }
    ];
    changed.containers = {
      containers: [
        { ...changed.containers.containers[0], originNodeId: "C", memberNodeIds: ["C"] },
        { ...changed.containers.containers[0], id: "new", originNodeId: "A", memberNodeIds: ["C"] }
      ]
    };
    changed.anchoring = {
      ...changed.anchoring!,
      anchors: new Map([
        ["parent", {
          ...changed.anchoring!.anchors.get("parent")!,
          bounds: { left: 500, right: 600, top: -40, bottom: 40 }
        }],
        ["new", {
          ...changed.anchoring!.anchors.get("parent")!,
          bounds: { left: 700, right: 800, top: -40, bottom: 40 }
        }]
      ]),
      fixedCoordinates: new Map([["C", { x: 80, y: 0 }]])
    };
    engine.setInput(changed);
    expect(engine.getAnchoringReconciliation()).toMatchObject({
      resetContainers: [{ containerId: "parent", reason: "origin-changed" }],
      addedContainerIds: ["new"],
      removedContainerIds: [],
      removedFixedCoordinateNodeIds: ["B"],
      addedFixedCoordinateNodeIds: ["C"]
    });
    expect(engine.getAnchoringState()?.anchors.get("parent")?.bounds.left).toBe(500);
    expect(engine.getAnchoringState()?.anchors.get("new")?.bounds.left).toBe(700);
    expect(engine.getAnchoringState()?.fixedCoordinates.has("B")).toBe(false);
    expect(engine.getAnchoringState()?.fixedCoordinates.get("C")).toEqual({ x: 80, y: 0 });
    expect(engine.step(1).structuralRevision).toBe(5);
  });

  it("preserves a compatible container when only membership, bounds, or structural revision changes", () => {
    const engine = new StagedGraphPhysicsEngine();
    const first = containerInput();
    engine.setInput(first);
    engine.start();
    engine.step(1);
    const before = engine.getAnchoringState()!.anchors.get("parent")!;
    const updated = containerInput();
    updated.graph.structuralRevision = 6;
    updated.containers.containers[0].memberNodeIds = [];
    updated.containers.containers[0].bounds = { left: -900, right: -800, top: 0, bottom: 1 };
    updated.anchoring = undefined;
    engine.setInput(updated);
    const after = engine.getAnchoringState()!.anchors.get("parent")!;
    expect(after).toEqual(before);
    expect(engine.getAnchoringReconciliation()?.preservedContainerIds).toEqual(["parent"]);
    expect(engine.step(1).structuralRevision).toBe(6);
  });

  it("keeps existing state when an update omits anchoring, but rejects a new unseeded container", () => {
    const engine = new StagedGraphPhysicsEngine();
    const first = containerInput();
    engine.setInput(first);
    engine.start();
    engine.step(1);
    const updated = containerInput();
    updated.graph.structuralRevision = 8;
    updated.anchoring = undefined;
    updated.containers = {
      containers: [
        updated.containers.containers[0],
        { ...updated.containers.containers[0], id: "new" }
      ]
    };
    engine.setInput(updated);
    expect(engine.getAnchoringReconciliation()?.missingSeedContainerIds).toEqual(["new"]);
    expect(() => engine.step(1)).toThrow("Missing anchoring state for container: new");
  });

  it("settles after 24 consecutive low-velocity steps and stops stepping", () => {
    const value = input();
    value.graph.edges = [];
    value.settings = { ...normalizeGraphPhysicsSettings({ repulsionStrength: 0 }), damping: 1 };
    value.graph.nodes = value.graph.nodes.map((node) => ({
      ...node, velocity: { x: 0, y: 0 }
    }));
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    expect(engine.getStatus()).toBe("running");
    expect(engine.getTargetFrameIntervalMs()).toBe(16);
    for (let index = 0; index < 23; index += 1) {
      expect(engine.step(1).positions.get("A")).toEqual({ x: 0, y: 0 });
      expect(engine.getStatus()).toBe("running");
    }
    expect(engine.step(1).positions.get("A")).toEqual({ x: 0, y: 0 });
    expect(engine.getStatus()).toBe("settled");
    expect(engine.getLastStepDiagnostics()?.settling).toMatchObject({
      phase: "settled", status: "settled", continueSimulation: false,
      settledFrameCount: 24, targetFrameIntervalMs: 50
    });
    const diagnostics = engine.getLastStepDiagnostics();
    engine.step(1);
    expect(engine.getLastStepDiagnostics()).toEqual(diagnostics);
  });

  it("uses near-settle cadence while still running and returns to active cadence when reheated", () => {
    const value = input();
    value.graph.edges = [];
    value.settings = { ...normalizeGraphPhysicsSettings({ repulsionStrength: 0 }), damping: 1 };
    value.graph.nodes = value.graph.nodes.map((node) => ({
      ...node, velocity: { x: 0.01, y: 0 }
    }));
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    engine.step(1);
    expect(engine.getTargetFrameIntervalMs()).toBe(50);
    engine.reheat(0.2);
    expect(engine.getStatus()).toBe("running");
    expect(engine.getSettlingState()).toMatchObject({
      settledFrameCount: 1, lastMaxVelocity: 0.01
    });
    engine.setInteractionActive(true);
    expect(engine.getTargetFrameIntervalMs()).toBe(16);
    engine.step(1);
    expect(engine.getLastStepDiagnostics()?.settling).toMatchObject({
      phase: "active", settledFrameCount: 0, targetFrameIntervalMs: 16
    });
  });

  it("preserves the settled counter while frozen and resumes it afterward", () => {
    const value = input();
    value.graph.edges = [];
    value.settings = { ...normalizeGraphPhysicsSettings({ repulsionStrength: 0 }), damping: 1 };
    value.graph.nodes = value.graph.nodes.map((node) => ({
      ...node, velocity: { x: 0, y: 0 }
    }));
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    engine.step(1);
    engine.freeze();
    const before = engine.getSettlingState();
    expect(engine.step(1)).toEqual(engine.step(1));
    expect(engine.getSettlingState()).toEqual({
      ...before, status: "frozen"
    });
    engine.resume();
    expect(engine.getStatus()).toBe("running");
    engine.step(1);
    expect(engine.getSettlingState().settledFrameCount).toBe(2);
  });

  it("reheats a settled engine and resets settling hysteresis", () => {
    const value = input();
    value.graph.edges = [];
    value.settings = { ...normalizeGraphPhysicsSettings({ repulsionStrength: 0 }), damping: 1 };
    value.graph.nodes = value.graph.nodes.map((node) => ({
      ...node, velocity: { x: 0, y: 0 }
    }));
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    for (let index = 0; index < 24; index += 1) engine.step(1);
    expect(engine.getStatus()).toBe("settled");
    engine.reheat(0.15);
    expect(engine.getStatus()).toBe("running");
    expect(engine.getSettlingState()).toMatchObject({
      settledFrameCount: 0, lastMaxVelocity: Infinity
    });
    expect(engine.getTargetFrameIntervalMs()).toBe(16);
  });

  it("honors frozen input and returns detached position commands", () => {
    const value = input();
    value.constraints.simulationFrozen = true;
    const engine = new StagedGraphPhysicsEngine();
    engine.setInput(value);
    engine.start();
    expect(engine.getStatus()).toBe("frozen");
    expect(engine.setNodePosition("missing", { x: 1, y: 2 })).toBe(false);
    expect(engine.setNodePosition("A", { x: 5, y: 6 })).toBe(true);
    const frame = engine.step(0);
    (frame.positions.get("A") as { x: number }).x = 500;
    expect(engine.step(0).positions.get("A")).toEqual({ x: 5, y: 6 });
  });
});
