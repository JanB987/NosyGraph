import {
  GRAPH_DOCUMENT_RUNTIME_VERSION,
  type GraphDocument,
  type GraphDocumentConfiguration,
  type GraphLayoutState
} from "../graph-domain/GraphDocument";
import { copyGraphSnapshot, type GraphSnapshot } from "../graph-domain/GraphSnapshot";
import type { GraphSceneSnapshot } from "../graph-domain/GraphScene";
import { GraphSceneStore } from "./GraphSceneStore";
import {
  GraphStore,
  validateGraphSnapshot,
  type GraphStoreSnapshotValidationFailure
} from "./GraphStore";

export interface GraphDocumentInput {
  id: string;
  path: string;
  configuration: GraphDocumentConfiguration;
  snapshot: GraphSnapshot;
  scene: GraphSceneSnapshot;
  layout: GraphLayoutState;
}

export type GraphDocumentReadResult =
  | { ok: true; document: GraphDocument }
  | {
      ok: false;
      reason:
        | "invalid-json"
        | "unsupported-version"
        | "invalid-document"
        | "invalid-snapshot"
        | "invalid-scene"
        | "invalid-layout";
      failure?: GraphStoreSnapshotValidationFailure;
    };

export type GraphDocumentRestoreResult =
  | {
      ok: true;
      document: GraphDocument;
      store: GraphStore;
      sceneStore: GraphSceneStore;
    }
  | Extract<GraphDocumentReadResult, { ok: false }>;

export interface GraphDocumentStorage {
  read(path: string): Promise<string | undefined>;
  write(path: string, content: string): Promise<void>;
}

/**
 * Serializes committed detached state and restores it directly into stores.
 *
 * Restoration never replays badge toggles or reconstructs state from UI
 * gestures. Stable IDs, ownership arrays, expansions, scene records, node
 * coordinates, and viewport state are loaded as one validated snapshot.
 */
export class GraphDocumentPersistence {
  createDocument(input: GraphDocumentInput): GraphDocument {
    const document: GraphDocument = {
      id: normalize(input.id),
      path: normalize(input.path),
      configuration: copyConfiguration(input.configuration),
      runtime: {
        version: GRAPH_DOCUMENT_RUNTIME_VERSION,
        snapshot: copyGraphSnapshot(input.snapshot),
        scene: copyScene(input.scene),
        layout: copyLayout(input.layout)
      }
    };
    const validation = validateDocument(document);
    if (!validation.ok) throw new Error(validation.reason);
    return validation.document;
  }

  serialize(document: GraphDocument): string {
    const normalized = validateDocument(document);
    if (!normalized.ok) throw new Error(normalized.reason);
    return JSON.stringify(normalized.document, null, 2);
  }

  deserialize(raw: string): GraphDocumentReadResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "invalid-json" };
    }
    return this.readParsed(parsed);
  }

  restore(document: GraphDocument): GraphDocumentRestoreResult {
    const normalized = validateDocument(document);
    if (!normalized.ok) return normalized;
    try {
      return {
        ok: true,
        document: normalized.document,
        store: new GraphStore(normalized.document.runtime.snapshot),
        sceneStore: new GraphSceneStore(normalized.document.runtime.scene)
      };
    } catch {
      return { ok: false, reason: "invalid-scene" };
    }
  }

  async save(storage: GraphDocumentStorage, document: GraphDocument): Promise<void> {
    const path = normalize(document.path);
    if (!path) throw new Error("invalid-document");
    await storage.write(path, this.serialize(document));
  }

  async load(storage: GraphDocumentStorage, path: string): Promise<GraphDocumentReadResult> {
    const normalizedPath = normalize(path);
    if (!normalizedPath) return { ok: false, reason: "invalid-document" };
    const raw = await storage.read(normalizedPath);
    if (raw === undefined) return { ok: false, reason: "invalid-document" };
    return this.deserialize(raw);
  }

  async loadAndRestore(
    storage: GraphDocumentStorage,
    path: string
  ): Promise<GraphDocumentRestoreResult> {
    const loaded = await this.load(storage, path);
    if (!loaded.ok) return loaded;
    return this.restore(loaded.document);
  }

  private readParsed(parsed: unknown): GraphDocumentReadResult {
    const validation = validateDocument(parsed);
    if (!validation.ok) return validation;
    return { ok: true, document: validation.document };
  }
}

function validateDocument(
  raw: unknown
):
  | { ok: true; document: GraphDocument }
  | Extract<GraphDocumentReadResult, { ok: false }> {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid-document" };
  const value = raw as Record<string, unknown>;
  const id = normalize(value.id);
  const path = normalize(value.path);
  if (!id || !path) return { ok: false, reason: "invalid-document" };

  const configuration = value.configuration;
  if (!configuration || typeof configuration !== "object") {
    return { ok: false, reason: "invalid-document" };
  }
  const configValues = (configuration as Record<string, unknown>).values;
  if (!configValues || typeof configValues !== "object" || Array.isArray(configValues)) {
    return { ok: false, reason: "invalid-document" };
  }

  const runtime = value.runtime;
  if (!runtime || typeof runtime !== "object") return { ok: false, reason: "invalid-document" };
  const runtimeValue = runtime as Record<string, unknown>;
  if (runtimeValue.version !== GRAPH_DOCUMENT_RUNTIME_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }

  const snapshot = runtimeValue.snapshot;
  if (!isSnapshot(snapshot)) return { ok: false, reason: "invalid-snapshot" };
  let failure: GraphStoreSnapshotValidationFailure | null = null;
  try {
    failure = validateGraphSnapshot(snapshot);
  } catch {
    return { ok: false, reason: "invalid-snapshot" };
  }
  if (failure) return { ok: false, reason: "invalid-snapshot", failure };

  const scene = runtimeValue.scene;
  if (!isScene(scene)) return { ok: false, reason: "invalid-scene" };
  try {
    new GraphSceneStore(scene);
  } catch {
    return { ok: false, reason: "invalid-scene" };
  }

  const layout = runtimeValue.layout;
  if (!isLayout(layout)) return { ok: false, reason: "invalid-layout" };

  const document: GraphDocument = {
    id,
    path,
    configuration: { values: copyRecord(configValues as Readonly<Record<string, unknown>>) },
    runtime: {
      version: GRAPH_DOCUMENT_RUNTIME_VERSION,
      snapshot: copyGraphSnapshot(snapshot),
      scene: copyScene(scene),
      layout: copyLayout(layout)
    }
  };
  return { ok: true, document };
}

function isSnapshot(value: unknown): value is GraphSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<GraphSnapshot>;
  if (
    !Array.isArray(snapshot.notes)
    || !Array.isArray(snapshot.nodes)
    || !Array.isArray(snapshot.badges)
    || !Array.isArray(snapshot.edges)
    || !Array.isArray(snapshot.expansions)
    || !Array.isArray(snapshot.lenses)
  ) {
    return false;
  }
  if (
    !snapshot.notes.every(isRecord)
    || !snapshot.nodes.every(isRecord)
    || !snapshot.badges.every(isRecord)
    || !snapshot.edges.every(isRecord)
    || !snapshot.expansions.every(isRecord)
    || !snapshot.lenses.every(isRecord)
  ) {
    return false;
  }
  return snapshot.notes.every((note) => isRecord(note.properties));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isScene(value: unknown): value is GraphSceneSnapshot {
  if (!value || typeof value !== "object") return false;
  const scene = value as Partial<GraphSceneSnapshot>;
  return Array.isArray(scene.lenses)
    && Array.isArray(scene.groups)
    && Array.isArray(scene.containers);
}

function isLayout(value: unknown): value is GraphLayoutState {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<GraphLayoutState>;
  return typeof layout.layoutId === "string"
    && layout.layoutId.trim().length > 0
    && Boolean(layout.viewport)
    && Number.isFinite(layout.viewport?.x)
    && Number.isFinite(layout.viewport?.y)
    && Number.isFinite(layout.viewport?.zoom)
    && (layout.viewport?.zoom ?? 0) > 0;
}

function copyConfiguration(configuration: GraphDocumentConfiguration): GraphDocumentConfiguration {
  return { values: copyRecord(configuration.values) };
}

function copyScene(scene: GraphSceneSnapshot): GraphSceneSnapshot {
  return {
    lenses: scene.lenses.map((lens) => ({
      ...lens,
      bounds: { ...lens.bounds },
      viewport: { ...lens.viewport }
    })),
    groups: scene.groups.map((group) => ({ ...group })),
    containers: scene.containers.map((container) => ({
      ...container,
      memberNodeIds: [...container.memberNodeIds],
      parentContainerIds: [...container.parentContainerIds],
      bounds: { ...container.bounds }
    }))
  };
}

function copyLayout(layout: GraphLayoutState): GraphLayoutState {
  return {
    layoutId: String(layout.layoutId),
    viewport: { ...layout.viewport }
  };
}

function copyRecord(
  value: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, copyValue(item)])
  );
}

function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === "object") return copyRecord(value as Record<string, unknown>);
  return value;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}
