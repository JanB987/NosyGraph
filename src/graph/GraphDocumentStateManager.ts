import type { DocumentService } from "../core/documents/DocumentService";
import type { DocumentUndoRedoService } from "../core/services/DocumentUndoRedoService";
import type { WorkspaceDocumentReference } from "../core/views/types";
import type { GraphViewState } from "../views/GraphViewStateStore";
import {
  createDefaultViewFilterGroup,
  normalizeViewFilterExpression,
  type ViewFilterGroup,
} from "../core/views/ViewDocument";

export interface GraphDocumentStateManagerOptions {
  documentService: DocumentService;
  documentUndoRedoService: DocumentUndoRedoService;
  workspaceLoadedGraphViews: Map<string, GraphViewState>;
  rerenderVisibleGraphDocuments: (documentPath: string) => void;
  refreshPropertiesPanel: (documentPath: string) => Promise<void>;
  rerenderActiveContextPanels: () => void;
  bumpDocumentStateVersion: (documentPath: string) => number;
  setPendingFocusRestore: (
    document: WorkspaceDocumentReference,
    focusRestore: {
      target: "value";
      path: string;
      selectionStart: number;
      selectionEnd: number;
    },
  ) => void;
  isInspectableDocumentPath: (documentPath: string) => boolean;
  showOperationError: (message: string, error: unknown) => void;
}

export class GraphDocumentStateManager {
  constructor(private readonly options: GraphDocumentStateManagerOptions) {}

  private static readonly TRANSIENT_SAVE_RETRY_DELAY_MS = 180;

  getLoadedViews(): Map<string, GraphViewState> {
    return this.options.workspaceLoadedGraphViews;
  }

  async persistDocument(
    documentPath: string,
    options?: { showError?: boolean; resolveDocument?: () => WorkspaceDocumentReference },
  ): Promise<void> {
    const view = this.options.workspaceLoadedGraphViews.get(documentPath);
    if (!view) {
      return;
    }
    const document = options?.resolveDocument?.() ?? {
      path: documentPath,
      kind: "graph-view" as const,
      viewTypeId: "graph",
    };
    try {
      await this.saveDocumentWithRetry(document, this.cloneGraphViewState(view));
    } catch (error) {
      if (options?.showError !== false) {
        this.options.showOperationError("Unable to save graph document.", error);
      }
    }
  }

  async updateDocument(
    document: WorkspaceDocumentReference,
    updater: (current: GraphViewState) => GraphViewState,
    options?: {
      skipHistory?: boolean;
      skipPersist?: boolean;
      skipPaneRender?: boolean;
      restoreFocus?: {
        target: "value";
        path: string;
        selectionStart: number;
        selectionEnd: number;
      };
    },
  ): Promise<void> {
    const current = this.options.workspaceLoadedGraphViews.get(document.path);
    if (!current) {
      return;
    }

    const previousRaw = this.serializeGraphSnapshot(current);
    const cloned = this.cloneGraphViewState(current);
    const next = updater(cloned);
    next.filters = this.normalizeEditableRootFilter(next.filters);
    this.options.workspaceLoadedGraphViews.set(document.path, next);
    this.options.bumpDocumentStateVersion(document.path);
    if (options?.restoreFocus) {
      this.options.setPendingFocusRestore(document, options.restoreFocus);
    }
    try {
      if (options?.skipPersist !== true) {
        await this.saveDocumentWithRetry(document, next);
      }
      const nextRaw = this.serializeGraphSnapshot(next);
      if (options?.skipHistory !== true && previousRaw && nextRaw) {
        this.options.documentUndoRedoService.record(document, previousRaw, nextRaw);
      }
      if (options?.skipPaneRender !== true) {
        this.options.rerenderVisibleGraphDocuments(document.path);
      }
      if (options?.skipPaneRender !== true && this.options.isInspectableDocumentPath(document.path)) {
        await this.options.refreshPropertiesPanel(document.path);
      }
      this.options.rerenderActiveContextPanels();
    } catch (error) {
      this.options.workspaceLoadedGraphViews.set(document.path, current);
      this.options.bumpDocumentStateVersion(document.path);
      if (options?.skipPaneRender !== true) {
        this.options.rerenderVisibleGraphDocuments(document.path);
      }
      this.options.rerenderActiveContextPanels();
      this.options.showOperationError("Unable to save graph document.", error);
    }
  }

  private async saveDocumentWithRetry(document: WorkspaceDocumentReference, payload: GraphViewState): Promise<void> {
    try {
      await this.options.documentService.saveDocument(document, payload);
    } catch (error) {
      if (!this.isTransientBusyError(error)) {
        throw error;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, GraphDocumentStateManager.TRANSIENT_SAVE_RETRY_DELAY_MS));
      await this.options.documentService.saveDocument(document, payload);
    }
  }

  private isTransientBusyError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /\bEBUSY\b/i.test(message) || /\bresource busy or locked\b/i.test(message);
  }

  private cloneGraphViewState(view: GraphViewState): GraphViewState {
    return JSON.parse(JSON.stringify(view)) as GraphViewState;
  }

  private serializeGraphSnapshot(value: GraphViewState): string {
    return JSON.stringify(value ?? {}, null, 2);
  }

  private normalizeEditableRootFilter(filters: GraphViewState["filters"]): ViewFilterGroup {
    const normalized = normalizeViewFilterExpression(filters, "root");
    if (normalized.type === "group") {
      return normalized;
    }
    return createDefaultViewFilterGroup();
  }
}
