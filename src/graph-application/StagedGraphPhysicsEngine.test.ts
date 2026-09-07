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

  it("detaches seeds and inspection results and replaces state on setInput", () => {
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
    engine.setInput(containerInput());
    expect(engine.getLastStepDiagnostics()).toBeUndefined();
    expect(engine.step(1).positions.get("B")?.x).toBe(74);
    engine.setInput(input());
    expect(engine.getAnchoringState()?.anchors.size).toBe(0);
    expect(engine.getAnchoringState()?.fixedCoordinates.size).toBe(0);
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
