import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../graph-domain/GraphDocument";
import type { GraphKinematicsFrameInput } from "../graph-domain/GraphKinematicsFrame";
import type { GraphSnapshot } from "../graph-domain/GraphSnapshot";
import { GraphDocumentPersistence } from "./GraphDocumentPersistence";
import { GraphKinematicsStore } from "./GraphKinematicsStore";
import { DeterministicGraphPhysicsEngine } from "./GraphPhysicsEngine";
import { GraphPhysicsCoordinator } from "./GraphPhysicsCoordinator";
import { GraphLifecycleCoordinator } from "./GraphLifecycleCoordinator";
import type { GraphRenderSnapshot, GraphRendererIntent } from "./GraphRenderer";
import { GraphRuntimeModeSelector, type GraphRuntimeHandle } from "./GraphRuntimeModeSelector";
import { LegacyGraphRuntimeState } from "./LegacyGraphRuntimeState";
import { GraphSceneStore } from "./GraphSceneStore";
import { GraphStore } from "./GraphStore";
import { StoreGraphRuntime, type StoreGraphRenderer } from "./StoreGraphRuntime";
import { StoreGraphRuntimeState } from "./StoreGraphRuntimeState";

const REPRESENTATIVE_SIZES = [12, 96, 384];

class ComparisonRenderer implements StoreGraphRenderer {
  renders = 0;
  intentSubscriptions = 0;
  private listener?: (intent: GraphRendererIntent) => void;
  mount(_container: HTMLElement): void {}
  unmount(): void { this.listener = undefined; }
  render(_snapshot: GraphRenderSnapshot): void { this.renders += 1; }
  onIntent(listener: (intent: GraphRendererIntent) => void): () => void {
    this.intentSubscriptions += 1;
    this.listener = listener;
    return () => {
      this.listener = undefined;
      this.intentSubscriptions -= 1;
    };
  }
}

class ComparisonRepository {
  documents: GraphDocument[] = [];
  async save(document: GraphDocument): Promise<void> { this.documents.push(document); }
}

function graphSnapshot(size: number): GraphSnapshot {
  const notes = Array.from({ length: size }, (_, index) => ({
    id: `N${index}.md`,
    path: `N${index}.md`,
    name: `N${index}`,
    availability: "available" as const,
    properties: { index }
  }));
  const nodes = notes.map((note, index) => ({
    id: `node:${index}`,
    noteId: note.id,
    contextId: "graph:root",
    position: { x: index * 20, y: index % 11 },
    velocity: { x: 0.5, y: 0 },
    radius: 18,
    pinned: false,
    selected: false,
    origin: { kind: "root" as const }
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge:${index}`,
    fromNodeId: nodes[index]!.id,
    toNodeId: node.id,
    linkTypeId: "parts",
    contextId: "graph:root",
    origin: "visible" as const
  }));
  return { notes, nodes, edges, badges: [], expansions: [], lenses: [] };
}

function initialFrame(snapshot: GraphSnapshot): GraphKinematicsFrameInput {
  return {
    structuralRevision: 0,
    positions: new Map(snapshot.nodes.map((node) => [node.id, { ...node.position }])),
    velocities: new Map(snapshot.nodes.map((node) => [node.id, { ...node.velocity }]))
  };
}

interface ModeRunResult {
  mode: "legacy" | "store";
  size: number;
  identityCount: number;
  openMs: number;
  queryMs: number;
  persistenceMs: number;
  closeMs: number;
  cleanupComplete: boolean;
  restoredIdentityCount: number;
  motion: "controlled" | "legacy-not-controlled";
}

describe("D4 full mode regression and performance comparisons", () => {
  it("runs persistence, representative sizes, interaction boundaries, and cleanup in both modes", async () => {
    const results: ModeRunResult[] = [];
    for (const size of REPRESENTATIVE_SIZES) {
      results.push(await runLegacy(size));
      results.push(await runStore(size));
    }

    for (const size of REPRESENTATIVE_SIZES) {
      const legacy = results.find((result) => result.size === size && result.mode === "legacy")!;
      const store = results.find((result) => result.size === size && result.mode === "store")!;
      expect(store.identityCount).toBe(legacy.identityCount);
      expect(store.restoredIdentityCount).toBe(size);
      expect(legacy.restoredIdentityCount).toBe(size);
      expect(legacy.openMs).toBeGreaterThanOrEqual(0);
      expect(store.openMs).toBeGreaterThanOrEqual(0);
      expect(legacy.queryMs).toBeGreaterThanOrEqual(0);
      expect(store.queryMs).toBeGreaterThanOrEqual(0);
      expect(legacy.persistenceMs).toBeGreaterThanOrEqual(0);
      expect(store.persistenceMs).toBeGreaterThanOrEqual(0);
      expect(legacy.closeMs).toBeGreaterThanOrEqual(0);
      expect(store.closeMs).toBeGreaterThanOrEqual(0);
      expect(legacy.cleanupComplete).toBe(true);
      expect(store.cleanupComplete).toBe(true);
      expect(store.motion).toBe("controlled");
      expect(legacy.motion).toBe("legacy-not-controlled");
    }
  });
});

async function runLegacy(size: number): Promise<ModeRunResult> {
  const source = graphSnapshot(size);
  const persistence = new GraphDocumentPersistence();
  const lifecycle = new GraphLifecycleCoordinator();
  const selector = new GraphRuntimeModeSelector({
    factories: {
      createLegacy: (path) => {
        const state = new LegacyGraphRuntimeState(
          { getSnapshot: () => source },
          { getStructuralRevision: () => 0 }
        );
        return handle("legacy", path, state, () => lifecycle.close());
      },
      createStore: () => { throw new Error("store factory must not run in legacy comparison"); }
    }
  });
  const openStart = Date.now();
  const opened = await selector.open(`Graph-${size}.md`, "legacy");
  if (!opened.ok) throw new Error("Legacy comparison failed to open");
  lifecycle.open(opened.handle.path);
  const openMs = Date.now() - openStart;

  const queryStart = Date.now();
  let identityCount = 0;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    identityCount = opened.handle.state.getSnapshot().nodes.length;
  }
  const queryMs = Date.now() - queryStart;
  const persistenceStart = Date.now();
  const document = persistence.createDocument({
    id: `graph:legacy:${size}`,
    path: opened.handle.path,
    configuration: { values: { size } },
    snapshot: opened.handle.state.getSnapshot(),
    scene: new GraphSceneStore().getSnapshot(),
    layout: { layoutId: "default", viewport: { x: 0, y: 0, zoom: 1 } }
  });
  const restored = persistence.restore(document);
  const persistenceMs = Date.now() - persistenceStart;
  expect(restored.ok).toBe(true);
  if (!restored.ok) throw new Error("Legacy persistence restore failed");
  expect(opened.handle.state.applyChangeSet({
    cause: { kind: "badge-expand", badgeId: "missing", expansionId: "missing" },
    notes: { upsert: [], removeIds: [] }, nodes: { upsert: [], removeIds: [] },
    edges: { upsert: [], removeIds: [] }, badges: { upsert: [], removeIds: [] },
    expansions: { upsert: [], removeIds: [] }, lenses: { upsert: [], removeIds: [] }
  })).toMatchObject({ applied: false, reason: "runtime-read-only" });
  const closeStart = Date.now();
  await selector.close();
  const closeMs = Date.now() - closeStart;
  return {
    mode: "legacy",
    size,
    identityCount,
    openMs,
    queryMs,
    persistenceMs,
    closeMs,
    cleanupComplete: selector.getActive() === undefined && lifecycle.isOpen() === false,
    restoredIdentityCount: restored.store.getSnapshot().nodes.length,
    motion: "legacy-not-controlled"
  };
}

async function runStore(size: number): Promise<ModeRunResult> {
  const source = graphSnapshot(size);
  const persistence = new GraphDocumentPersistence();
  const lifecycle = new GraphLifecycleCoordinator();
  const repository = new ComparisonRepository();
  let runtime: StoreGraphRuntime | undefined;
  let renderer: ComparisonRenderer | undefined;
  let storeState: StoreGraphRuntimeState | undefined;
  const selector = new GraphRuntimeModeSelector({
    storeTrialEnabled: true,
    factories: {
      createLegacy: () => { throw new Error("legacy factory must not run in store comparison"); },
      createStore: (path) => {
        const store = new GraphStore(source);
        const kinematics = new GraphKinematicsStore(initialFrame(source));
        const physics = new GraphPhysicsCoordinator(
          new DeterministicGraphPhysicsEngine(),
          kinematics
        );
        renderer = new ComparisonRenderer();
        runtime = new StoreGraphRuntime({
          document: {
            id: `graph:store:${size}`,
            path,
            configuration: { values: { size } }
          },
          store,
          kinematics,
          physics,
          renderer,
          repository,
          lifecycle
        });
        storeState = new StoreGraphRuntimeState(store);
        return handle("store", path, storeState, () => runtime!.close());
      }
    }
  });
  const openStart = Date.now();
  const opened = await selector.open(`Graph-${size}.md`, "store");
  if (!opened.ok || !runtime || !renderer || !storeState) throw new Error("Store comparison failed to open");
  expect(runtime.open()).toBe(true);
  const openMs = Date.now() - openStart;
  const queryStart = Date.now();
  let identityCount = 0;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    identityCount = storeState.getSnapshot().nodes.length;
  }
  const queryMs = Date.now() - queryStart;
  runtime.start();
  expect(runtime.step(1).applied).toBe(true);
  expect((await runtime.executeSelection({ type: "select-only", nodeId: "node:0" })).changed).toBe(true);
  const persistenceStart = Date.now();
  expect(await runtime.save()).toBe(true);
  const persistenceMs = Date.now() - persistenceStart;
  const document = repository.documents[repository.documents.length - 1];
  if (!document) throw new Error("Store comparison did not save");
  const restored = persistence.restore(document);
  expect(restored.ok).toBe(true);
  if (!restored.ok) throw new Error("Store persistence restore failed");
  const closeStart = Date.now();
  await selector.close();
  const closeMs = Date.now() - closeStart;
  return {
    mode: "store",
    size,
    identityCount,
    openMs,
    queryMs,
    persistenceMs,
    closeMs,
    cleanupComplete: selector.getActive() === undefined
      && lifecycle.isOpen() === false
      && renderer.intentSubscriptions === 0,
    restoredIdentityCount: restored.store.getSnapshot().nodes.length,
    motion: "controlled"
  };
}

function handle(
  mode: "legacy" | "store",
  path: string,
  state: LegacyGraphRuntimeState | StoreGraphRuntimeState,
  close: () => void
): GraphRuntimeHandle {
  return { mode, path, state, close };
}