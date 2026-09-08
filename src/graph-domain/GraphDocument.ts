import type { GraphSnapshot } from "./GraphSnapshot";
import type { GraphSceneSnapshot } from "./GraphScene";
import type { GraphViewport } from "./GraphLens";
import type { GraphDocumentId } from "./graph-identifiers";

export const GRAPH_DOCUMENT_RUNTIME_VERSION = 1;

export interface GraphDocumentConfiguration {
  /** Host-neutral configuration values are preserved without host object references. */
  values: Readonly<Record<string, unknown>>;
}

export interface GraphLayoutState {
  layoutId: string;
  viewport: GraphViewport;
}

export interface PersistedGraphRuntime {
  version: typeof GRAPH_DOCUMENT_RUNTIME_VERSION;
  snapshot: GraphSnapshot;
  scene: GraphSceneSnapshot;
  layout: GraphLayoutState;
}

export interface GraphDocument {
  id: GraphDocumentId;
  path: string;
  configuration: GraphDocumentConfiguration;
  runtime: PersistedGraphRuntime;
}
