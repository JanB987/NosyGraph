import { describe, expect, it } from "vitest";
import type { GraphRenderSnapshot, GraphRendererIntent } from "./GraphRenderer";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphKinematicsFrameInput } from "../graph-domain/GraphKinematicsFrame";
import type { GraphDocument } from "../graph-domain/GraphDocument";
import { GraphStore } from "./GraphStore";
import { GraphKinematicsStore } from "./GraphKinematicsStore";
import { DeterministicGraphPhysicsEngine } from "./GraphPhysicsEngine";
import { GraphPhysicsCoordinator } from "./GraphPhysicsCoordinator";
import { StoreGraphRuntime, type StoreGraphRenderer } from "./StoreGraphRuntime";

const nodeId = "node:A";

function snapshot(): GraphSnapshot {
  return {
    notes: [{ id: "A.md", path: "A.md", name: "A", availability: "available", properties: {} }],
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
    edges: [],
    badges: [],
    expansions: [],
    lenses: []
  };
}

function initialFrame(store: GraphStore): GraphKinematicsFrameInput {
  const node = store.getSnapshot().nodes[0];
  return {
    structuralRevision: store.getRevision(),
    positions: new Map([[node.id, { ...node.position }]]),
    velocities: new Map([[node.id, { ...node.velocity }]])
  };
}

class FakeRenderer implements StoreGraphRenderer {
  renders: GraphRenderSnapshot[] = [];
  mounted = 0;
  unmounted = 0;
  private listener?: (intent: GraphRendererIntent) => void;
  mount(): void { this.mounted += 1; }
  unmount(): void { this.unmounted += 1; }
  render(snapshot: GraphRenderSnapshot): void { this.renders.push(snapshot); }
  onIntent(listener: (intent: GraphRendererIntent) => void): () => void {
    this.listener = listener;
    return () => { this.listener = undefined; };
  }
  emit(intent: GraphRendererIntent): void { this.listener?.(intent); }
}

class FakeRepository {
  documents: GraphDocument[] = [];
  async save(document: GraphDocument): Promise<void> { this.documents.push(document); }
}

function runtimeFixture() {
  const store = new GraphStore(snapshot());
  const kinematics = new GraphKinematicsStore(initialFrame(store));
  const physics = new GraphPhysicsCoordinator(new DeterministicGraphPhysicsEngine(), kinematics);
  const renderer = new FakeRenderer();
  const repository = new FakeRepository();
  const runtime = new StoreGraphRuntime({
    document: { id: "graph:test", path: "Graph.md", configuration: { values: { theme: "test" } } },
    store,
    kinematics,
    physics,
    renderer,
    repository
  });
  return { runtime, store, kinematics, physics, renderer, repository };
}

describe("StoreGraphRuntime", () => {
  it("composes initial input and keeps semantic revision separate from motion sequence", () => {
    const { runtime, kinematics, physics, renderer, repository } = runtimeFixture();
    expect(runtime.open()).toBe(true);
    expect(runtime.getSemanticRevision()).toBe(0);
    expect(runtime.getMotionSequence()).toBe(0);
    expect(renderer.renders[renderer.renders.length - 1]?.nodes[0].position).toEqual({ x: 10, y: 20 });
    expect(repository.documents).toHaveLength(0);

    runtime.start();
    const stepped = runtime.step(1);
    expect(stepped.applied).toBe(true);
    expect(runtime.getSemanticRevision()).toBe(0);
    expect(kinematics.getSequence()).toBe(1);
    expect(renderer.renders[renderer.renders.length - 1]?.nodes[0].position).toEqual({ x: 12, y: 20 });
    expect(repository.documents).toHaveLength(0);
  });

  it("routes node intents through the controller and persists semantic commits", async () => {
    const { runtime, store, kinematics, renderer, repository } = runtimeFixture();
    runtime.open();
    renderer.emit({
      kind: "node-clicked",
      nodeId,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.isNodeSelected(nodeId)).toBe(true);
    expect(runtime.getSemanticRevision()).toBe(1);
    expect(kinematics.getFrame().structuralRevision).toBe(1);
    expect(kinematics.getSequence()).toBe(1);
    expect(repository.documents).toHaveLength(1);
    expect(repository.documents[0].runtime.snapshot.nodes[0].selected).toBe(true);
  });

  it("saves committed layout and scene state without replaying commands", async () => {
    const { runtime, repository, renderer } = runtimeFixture();
    runtime.open();
    runtime.setViewport({ x: 4, y: 8, zoom: 1.5 });
    expect(await runtime.save()).toBe(true);
    expect(repository.documents).toHaveLength(1);
    expect(repository.documents[0].runtime.layout).toEqual({
      layoutId: "default",
      viewport: { x: 4, y: 8, zoom: 1.5 }
    });
    expect(renderer.renders[renderer.renders.length - 1]?.viewport).toEqual({ x: 4, y: 8, zoom: 1.5 });
  });

  it("stops physics and detaches renderer intents when closed", () => {
    const { runtime, renderer, physics } = runtimeFixture();
    runtime.open();
    runtime.close();
    expect(runtime.isOpen()).toBe(false);
    expect(renderer.unmounted).toBe(1);
    expect(physics.step(1).applied).toBe(true);
    expect(runtime.step(1)).toEqual({ applied: false, reason: "runtime-closed" });
  });
});