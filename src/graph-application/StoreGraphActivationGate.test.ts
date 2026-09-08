import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../graph-domain/GraphDocument";
import { createEmptyGraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphKinematicsFrameInput } from "../graph-domain/GraphKinematicsFrame";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphStoreInitializer } from "./GraphStoreInitializer";
import { GraphKinematicsStore } from "./GraphKinematicsStore";
import { DeterministicGraphPhysicsEngine } from "./GraphPhysicsEngine";
import { GraphPhysicsCoordinator } from "./GraphPhysicsCoordinator";
import type { GraphRenderSnapshot, GraphRendererIntent } from "./GraphRenderer";
import { LegacyGraphRuntimeState } from "./LegacyGraphRuntimeState";
import { StoreGraphRuntime, type StoreGraphRenderer } from "./StoreGraphRuntime";

const nodeId = "root:A";
const badgeId = "root:A::parts";

function sourceSnapshot(): GraphSnapshot {
  return {
    notes: [{
      id: "A.md",
      path: "A.md",
      name: "A",
      availability: "available",
      properties: { source: true }
    }],
    nodes: [{
      id: nodeId,
      noteId: "A.md",
      contextId: "graph:root",
      position: { x: 10, y: 20 },
      velocity: { x: 2, y: 0 },
      radius: 20,
      pinned: false,
      selected: false,
      origin: { kind: "root" }
    }],
    badges: [{
      id: badgeId,
      nodeId,
      linkTypeId: "parts",
      contextId: "graph:root",
      label: "Parts",
      color: "#4488cc",
      state: "collapsed",
      semantic: "link",
      hasRelationships: true,
      duplicateNodes: false
    }],
    edges: [],
    expansions: [],
    lenses: []
  };
}

function initialFrame(store: { getRevision(): number; getSnapshot(): GraphSnapshot }): GraphKinematicsFrameInput {
  const node = store.getSnapshot().nodes[0]!;
  return {
    structuralRevision: store.getRevision(),
    positions: new Map([[node.id, { ...node.position }]]),
    velocities: new Map([[node.id, { ...node.velocity }]])
  };
}

class GateRenderer implements StoreGraphRenderer {
  renders: GraphRenderSnapshot[] = [];
  private listener?: (intent: GraphRendererIntent) => void;
  mount(_container: HTMLElement): void {}
  unmount(): void { this.listener = undefined; }
  render(snapshot: GraphRenderSnapshot): void { this.renders.push(snapshot); }
  onIntent(listener: (intent: GraphRendererIntent) => void): () => void {
    this.listener = listener;
    return () => { this.listener = undefined; };
  }
}

class GateRepository {
  documents: GraphDocument[] = [];
  async save(document: GraphDocument): Promise<void> { this.documents.push(document); }
}

function makeRuntime(source: GraphSnapshot) {
  const initialized = new GraphStoreInitializer({ getSnapshot: () => source }).initialize();
  if (!initialized.ok) throw new Error("Expected valid gate fixture");
  const kinematics = new GraphKinematicsStore(initialFrame(initialized.store));
  const physics = new GraphPhysicsCoordinator(
    new DeterministicGraphPhysicsEngine(),
    kinematics
  );
  const renderer = new GateRenderer();
  const repository = new GateRepository();
  const runtime = new StoreGraphRuntime({
    document: {
      id: "graph:gate",
      path: "Graph.md",
      configuration: { values: {} }
    },
    store: initialized.store,
    kinematics,
    physics,
    renderer,
    repository
  });
  return { runtime, store: initialized.store, kinematics, renderer, repository };
}

describe("D2 store-mode activation gates", () => {
  it("keeps supported store operations detached from the legacy source collections", async () => {
    const legacyCollections = sourceSnapshot();
    const before = sourceSnapshot();
    const { runtime, store, kinematics, repository } = makeRuntime(legacyCollections);

    expect(runtime.open()).toBe(true);
    runtime.start();
    expect(runtime.step(1).applied).toBe(true);
    await runtime.executeSelection({ type: "select-only", nodeId });
    expect(await runtime.save()).toBe(true);

    expect(store.isNodeSelected(nodeId)).toBe(true);
    expect(kinematics.getSequence()).toBeGreaterThan(0);
    expect(repository.documents).toHaveLength(2);
    expect(legacyCollections).toEqual(before);
  });

  it("keeps renderer and physics work outside semantic revisions", () => {
    const source = sourceSnapshot();
    const { runtime, store, kinematics, renderer } = makeRuntime(source);

    runtime.open();
    const initialRevision = store.getRevision();
    runtime.start();
    expect(runtime.step(1).applied).toBe(true);

    expect(store.getRevision()).toBe(initialRevision);
    expect(kinematics.getSequence()).toBe(1);
    expect(renderer.renders[renderer.renders.length - 1]?.nodes[0]?.position).toEqual({
      x: 12,
      y: 20
    });
    expect(source.nodes[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it("fails unsupported store interactions visibly without falling through to legacy mutation", async () => {
    const legacyCollections = sourceSnapshot();
    const before = sourceSnapshot();
    const { runtime, store } = makeRuntime(legacyCollections);
    runtime.open();

    await expect(runtime.controller.executeBadgeInteraction({
      type: "badge-interaction",
      badgeId,
      modifiers: { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
    })).resolves.toEqual({
      handled: false,
      badgeId,
      reason: "badge-port-unavailable"
    });
    await expect(runtime.controller.executePin({ type: "pin-node", nodeId }))
      .resolves.toEqual({ handled: false, nodeId, reason: "pin-port-unavailable" });
    await expect(runtime.controller.executeDrag({
      type: "move-drag", nodeId, position: { x: 30, y: 40 }
    })).resolves.toEqual({ handled: false, nodeId, reason: "drag-port-unavailable" });
    await expect(runtime.controller.executeRoot({ type: "add-root", nodeId }))
      .resolves.toEqual({ handled: false, reason: "root-port-unavailable" });
    await expect(runtime.controller.executeScene({
      type: "create-group", group: {
        id: "group:unsupported",
        label: "Unsupported",
        property: "status", operator: "exists", color: "#fff", priority: 0
      }
    })).resolves.toMatchObject({ handled: false, reason: "scene-port-unavailable" });
    await expect(runtime.controller.executeRelationshipRefresh({
      type: "refresh-relationships", sourcePath: "A.md"
    })).resolves.toEqual({
      handled: false,
      sourcePath: "A.md",
      reason: "relationship-port-unavailable"
    });

    expect(store.getRevision()).toBe(0);
    expect(legacyCollections).toEqual(before);
  });

  it("keeps legacy mode read-only at the activation boundary", () => {
    let revision = 4;
    const legacyCollections = sourceSnapshot();
    const legacy = new LegacyGraphRuntimeState(
      { getSnapshot: () => legacyCollections },
      { getStructuralRevision: () => revision }
    );

    expect(legacy.applyChangeSet(createEmptyGraphChangeSet({
      kind: "badge-expand", badgeId, expansionId: "exp:unsupported"
    }), revision)).toEqual({
      applied: false,
      reason: "runtime-read-only",
      mode: "legacy"
    });
    revision += 1;
    expect(legacy.getStructuralRevision()).toBe(5);
    expect(legacyCollections).toEqual(sourceSnapshot());
  });
});