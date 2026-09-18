import type { GraphChangeSet } from "../graph-domain/GraphChangeSet";
import type { GraphDocument, GraphDocumentConfiguration, GraphLayoutState } from "../graph-domain/GraphDocument";
import type { GraphPhysicsContainerState } from "../graph-domain/GraphPhysicsContainers";
import type { GraphPhysicsSettingsInput } from "../graph-domain/GraphPhysicsSettings";
import type { GraphRenderSnapshot, GraphRenderViewport, GraphRendererIntent } from "./GraphRenderer";
import { GraphController, type GraphBadgeCommandResult, type GraphControllerOptions, type GraphSelectionCommand, type GraphSelectionResult } from "./GraphController";
import { GraphDocumentPersistence } from "./GraphDocumentPersistence";
import { GraphKinematicsStore } from "./GraphKinematicsStore";
import { GraphLifecycleCoordinator } from "./GraphLifecycleCoordinator";
import { GraphPhysicsRuntimeInputComposer } from "./GraphPhysicsRuntimeInputComposer";
import type { GraphTransientPhysicsConstraintInput } from "./GraphPhysicsConstraintProjector";
import type { GraphPhysicsStepResult } from "./GraphPhysicsCoordinator";
import { GraphQueries } from "./GraphQueries";
import { GraphSnapshotKinematicsComposer } from "./GraphSnapshotKinematicsComposer";
import { GraphSceneStore } from "./GraphSceneStore";
import { GraphStore, type GraphChangeSetApplyResult } from "./GraphStore";
import type { GraphDocumentId, NodeInstanceId } from "../graph-domain/graph-identifiers";
import type { GraphKinematicsFrameInput } from "../graph-domain/GraphKinematicsFrame";

export interface StoreGraphDocumentDescriptor {
  id: GraphDocumentId;
  path: string;
  configuration: GraphDocumentConfiguration;
}

export interface StoreGraphDocumentRepository {
  save(document: GraphDocument): Promise<void>;
}

export interface StoreGraphRenderer {
  mount(container: HTMLElement): void;
  unmount(): void;
  render(snapshot: GraphRenderSnapshot): void;
  onIntent(listener: (intent: GraphRendererIntent) => void): () => void;
}

export interface StoreGraphPhysicsPort {
  setInput(input: ReturnType<GraphPhysicsRuntimeInputComposer["compose"]>["input"]): void;
  start(): void;
  reheat(amount?: number): void;
  freeze(): void;
  resume(): void;
  stop(): void;
  step(deltaTime: number, expectedSequence?: number): GraphPhysicsStepResult;
}

export interface StoreGraphRuntimeOptions {
  document: StoreGraphDocumentDescriptor;
  store: GraphStore;
  kinematics: GraphKinematicsStore;
  physics: StoreGraphPhysicsPort;
  renderer: StoreGraphRenderer;
  sceneStore?: GraphSceneStore;
  controller?: GraphController;
  controllerOptions?: GraphControllerOptions;
  repository?: StoreGraphDocumentRepository;
  persistence?: GraphDocumentPersistence;
  lifecycle?: GraphLifecycleCoordinator;
  inputComposer?: GraphPhysicsRuntimeInputComposer;
  kinematicsComposer?: GraphSnapshotKinematicsComposer;
  settings?: GraphPhysicsSettingsInput;
  transientConstraints?: GraphTransientPhysicsConstraintInput;
  containers?: GraphPhysicsContainerState;
  layoutId?: string;
  viewport?: GraphRenderViewport;
  onError?: (error: unknown) => void;
}

export type StoreGraphRuntimeStepResult =
  | GraphPhysicsStepResult
  | { applied: false; reason: "runtime-closed" };

/**
 * Composes the detached store, scene, motion, renderer, commands, and
 * persistence boundaries into one document runtime.
 *
 * Semantic revisions belong to GraphStore. Motion-frame sequencing belongs to
 * GraphKinematicsStore. A frame publication never causes a document save.
 */
export class StoreGraphRuntime {
  readonly document: StoreGraphDocumentDescriptor;
  readonly store: GraphStore;
  readonly sceneStore: GraphSceneStore;
  readonly kinematics: GraphKinematicsStore;
  readonly physics: StoreGraphPhysicsPort;
  readonly renderer: StoreGraphRenderer;
  readonly controller: GraphController;

  private readonly repository?: StoreGraphDocumentRepository;
  private readonly persistence: GraphDocumentPersistence;
  private readonly lifecycle?: GraphLifecycleCoordinator;
  private readonly inputComposer: GraphPhysicsRuntimeInputComposer;
  private readonly kinematicsComposer: GraphSnapshotKinematicsComposer;
  private readonly settings?: GraphPhysicsSettingsInput;
  private readonly transientConstraints: GraphTransientPhysicsConstraintInput;
  private readonly containers: GraphPhysicsContainerState;
  private readonly onError: (error: unknown) => void;
  private readonly layoutId: string;
  private viewport: GraphRenderViewport;
  private openState = false;
  private stopIntentSubscription?: () => void;
  private inputRevision: number | undefined;

  constructor(options: StoreGraphRuntimeOptions) {
    this.document = {
      id: String(options.document.id ?? "").trim(),
      path: String(options.document.path ?? "").trim(),
      configuration: copyConfiguration(options.document.configuration)
    };
    if (!this.document.id || !this.document.path) throw new Error("Invalid graph document descriptor");
    this.store = options.store;
    this.sceneStore = options.sceneStore ?? new GraphSceneStore();
    this.kinematics = options.kinematics;
    this.physics = options.physics;
    this.renderer = options.renderer;
    this.repository = options.repository;
    this.persistence = options.persistence ?? new GraphDocumentPersistence();
    this.lifecycle = options.lifecycle;
    this.inputComposer = options.inputComposer ?? new GraphPhysicsRuntimeInputComposer();
    this.kinematicsComposer = options.kinematicsComposer ?? new GraphSnapshotKinematicsComposer();
    this.settings = options.settings;
    this.transientConstraints = options.transientConstraints ?? { simulationFrozen: false, nodeConstraints: [] };
    this.containers = options.containers ?? { containers: [] };
    this.layoutId = String(options.layoutId ?? "default").trim() || "default";
    this.viewport = normalizeViewport(options.viewport);
    this.onError = options.onError ?? (() => {});
    this.controller = options.controller ?? new GraphController(this.store, {
      ...options.controllerOptions,
      queries: options.controllerOptions?.queries ?? new GraphQueries(this.store)
    });
  }

  isOpen(): boolean {
    return this.openState;
  }

  getSemanticRevision(): number {
    return this.store.getRevision();
  }

  getMotionSequence(): number {
    return this.kinematics.getSequence();
  }

  mount(container: HTMLElement): void {
    this.renderer.mount(container);
    this.open();
  }

  open(): boolean {
    if (this.openState) return true;
    if (this.lifecycle && !this.lifecycle.open(this.document.path)) return false;
    this.openState = true;
    this.stopIntentSubscription = this.renderer.onIntent((intent) => {
      void this.routeIntent(intent).catch((error) => this.onError(error));
    });
    try {
      this.syncMotionToSemanticRevision();
      this.refreshPhysicsInput();
      this.render();
    } catch (error) {
      this.close();
      this.onError(error);
      return false;
    }
    return true;
  }

  close(): void {
    if (!this.openState && !this.stopIntentSubscription) return;
    this.stopIntentSubscription?.();
    this.stopIntentSubscription = undefined;
    this.physics.stop();
    this.renderer.unmount();
    this.lifecycle?.close();
    this.openState = false;
    this.inputRevision = undefined;
  }

  start(): void { this.physics.start(); }
  reheat(amount?: number): void { this.physics.reheat(amount); }
  freeze(): void { this.physics.freeze(); }
  resume(): void { this.physics.resume(); }

  setViewport(viewport: GraphRenderViewport): void {
    this.viewport = normalizeViewport(viewport);
    if (this.openState) this.render();
  }

  refreshPhysicsInput(): void {
    this.syncMotionToSemanticRevision();
    const composition = this.inputComposer.compose({
      snapshot: this.store.getSnapshot(),
      structuralRevision: this.store.getRevision(),
      frameSequence: this.kinematics.getSequence(),
      settings: this.settings,
      transientConstraints: this.transientConstraints,
      containers: this.containers
    });
    this.physics.setInput(composition.input);
    this.inputRevision = this.store.getRevision();
  }

  step(deltaTime: number): StoreGraphRuntimeStepResult {
    if (!this.openState) return { applied: false, reason: "runtime-closed" };
    const result = this.physics.step(deltaTime, this.kinematics.getSequence());
    if (result.applied) this.render();
    return result;
  }

  applyChangeSet(
    changeSet: GraphChangeSet,
    expectedRevision = this.store.getRevision()
  ): GraphChangeSetApplyResult {
    const result = this.store.applyChangeSet(changeSet, expectedRevision);
    if (result.applied && result.changeCount > 0) {
      void this.commitSemanticChange().catch((error) => this.onError(error));
    }
    return result;
  }

  async executeSelection(command: GraphSelectionCommand): Promise<GraphSelectionResult> {
    const before = this.store.getRevision();
    const result = this.controller.executeSelection(command);
    if (this.store.getRevision() !== before) await this.commitSemanticChange();
    else if (this.openState) this.render();
    return result;
  }

  async executeBadgeInteraction(
    command: Parameters<GraphController["executeBadgeInteraction"]>[0]
  ): Promise<GraphBadgeCommandResult> {
    const before = this.store.getRevision();
    const result = await this.controller.executeBadgeInteraction(command);
    if (this.store.getRevision() !== before) await this.commitSemanticChange();
    else if (this.openState) this.render();
    return result;
  }

  async save(): Promise<boolean> {
    if (!this.openState || !this.repository) return false;
    const document = this.persistence.createDocument({
      id: this.document.id,
      path: this.document.path,
      configuration: this.document.configuration,
      snapshot: this.store.getSnapshot(),
      scene: this.sceneStore.getSnapshot(),
      layout: {
        layoutId: this.layoutId,
        viewport: { ...this.viewport }
      } satisfies GraphLayoutState
    });
    const write = async (): Promise<boolean> => {
      await this.repository!.save(document);
      return true;
    };
    if (this.lifecycle) {
      const result = await this.lifecycle.runWrite(this.document.path, async () => write());
      return result === true;
    }
    await write();
    return true;
  }

  private async commitSemanticChange(): Promise<void> {
    this.syncMotionToSemanticRevision();
    this.refreshPhysicsInput();
    if (this.openState) this.render();
    if (this.repository) {
      try { await this.save(); } catch (error) { this.onError(error); }
    }
  }

  private syncMotionToSemanticRevision(): void {
    const revision = this.store.getRevision();
    const frame = this.kinematics.getFrame();
    if (frame.structuralRevision === revision) return;
    const snapshot = this.store.getSnapshot();
    const positions = new Map<NodeInstanceId, { x: number; y: number }>();
    const velocities = new Map<NodeInstanceId, { x: number; y: number }>();
    for (const node of snapshot.nodes) {
      positions.set(node.id, { ...(frame.positions.get(node.id) ?? node.position) });
      velocities.set(node.id, { ...(frame.velocities.get(node.id) ?? node.velocity) });
    }
    const input: GraphKinematicsFrameInput = {
      structuralRevision: revision,
      positions,
      velocities
    };
    const result = this.kinematics.publishFrame(input, this.kinematics.getSequence());
    if (!result.applied) throw new Error("Unable to reconcile graph motion with semantic revision");
  }

  private render(): void {
    if (!this.openState) return;
    this.syncMotionToSemanticRevision();
    const composition = this.kinematicsComposer.compose(
      this.store.getSnapshot(),
      this.store.getRevision(),
      this.kinematics.getFrame()
    );
    if (!composition.applied) return;
    this.renderer.render({ ...composition.snapshot, viewport: { ...this.viewport } });
  }

  private async routeIntent(intent: GraphRendererIntent): Promise<void> {
    const before = this.store.getRevision();
    if (intent.kind === "node-clicked") {
      await this.executeSelection({
        type: intent.shiftKey || intent.ctrlKey || intent.metaKey ? "toggle-selection" : "select-only",
        nodeId: intent.nodeId
      });
      return;
    }
    await this.executeBadgeInteraction({
      type: "badge-interaction",
      badgeId: intent.badgeId,
      modifiers: intent
    });
    if (this.store.getRevision() === before && this.openState) this.render();
  }
}

function normalizeViewport(viewport: GraphRenderViewport | undefined): GraphRenderViewport {
  return {
    x: Number.isFinite(viewport?.x) ? viewport!.x : 0,
    y: Number.isFinite(viewport?.y) ? viewport!.y : 0,
    zoom: Number.isFinite(viewport?.zoom) && viewport!.zoom > 0 ? viewport!.zoom : 1
  };
}

function copyConfiguration(configuration: GraphDocumentConfiguration): GraphDocumentConfiguration {
  return {
    values: Object.fromEntries(Object.entries(configuration?.values ?? {}).map(([key, value]) => [key, copyValue(value)]))
  };
}

function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, copyValue(item)]));
  }
  return value;
}
