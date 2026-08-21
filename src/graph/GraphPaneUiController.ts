import type { WMEntityRef } from "../core/views/ViewActionService";
import type { WorkspaceDocumentReference, WorkspacePaneId } from "../core/views/types";
import type { WorkspacePaneView } from "../ui/WorkspaceController";

export interface GraphPaneUiControllerOptions {
  getDocumentTitleFromPath: (path: string) => string;
  renameWorkspaceDocument: (document: WorkspaceDocumentReference, requestedTitle: string) => Promise<void>;
  getCurrentDraggedEntityRef: () => WMEntityRef | undefined;
  clearCurrentDraggedEntityRef: () => void;
  extractDraggedEntityRef: (dataTransfer: DataTransfer | null | undefined) => WMEntityRef | undefined;
  getActivePaneId: () => WorkspacePaneId;
  dispatchDrop: (payload: {
    targetDocument: WorkspaceDocumentReference;
    refs: WMEntityRef[];
    sourcePane: WorkspacePaneId;
    clientX: number;
    clientY: number;
  }) => Promise<void>;
}

export class GraphPaneUiController {
  constructor(private readonly options: GraphPaneUiControllerOptions) {}

  bindPane(args: {
    pane: WorkspacePaneId;
    paneView: WorkspacePaneView;
    document: WorkspaceDocumentReference;
  }): void {
    const { pane, paneView, document } = args;
    paneView.graphViewport.dataset.graphDocumentPath = document.path;
    paneView.graphTitleButton.textContent = this.options.getDocumentTitleFromPath(document.path);
    paneView.graphTitleButton.hidden = false;
    paneView.graphTitleInput.hidden = true;
    paneView.graphTitleInput.value = this.options.getDocumentTitleFromPath(document.path);
    paneView.graphTitleButton.onclick = () => {
      paneView.graphTitleButton.hidden = true;
      paneView.graphTitleInput.hidden = false;
      paneView.graphTitleInput.value = this.options.getDocumentTitleFromPath(document.path);
      paneView.graphTitleInput.focus();
      paneView.graphTitleInput.select();
    };
    paneView.graphTitleInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.options.renameWorkspaceDocument(document, paneView.graphTitleInput.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        paneView.graphTitleInput.hidden = true;
        paneView.graphTitleButton.hidden = false;
        paneView.graphTitleInput.value = this.options.getDocumentTitleFromPath(document.path);
      }
    };
    paneView.graphTitleInput.onblur = () => {
      void this.options.renameWorkspaceDocument(document, paneView.graphTitleInput.value);
    };
    this.attachDropTarget(pane, paneView.graphViewport);
  }

  clearPane(paneView: WorkspacePaneView): void {
    delete paneView.graphViewport.dataset.graphDocumentPath;
    paneView.graphViewport.classList.remove("is-graph-drop-target");
    paneView.graphViewport.classList.remove("is-sidebar-collapsed");
    paneView.graphTitleButton.textContent = "Graph";
    paneView.graphTitleButton.hidden = false;
    paneView.graphTitleInput.hidden = true;
    paneView.graphTitleInput.value = "Graph";
    paneView.graphTitleButton.onclick = null;
    paneView.graphTitleInput.onkeydown = null;
    paneView.graphTitleInput.onblur = null;
  }

  private attachDropTarget(paneId: WorkspacePaneId, viewport: HTMLElement): void {
    if (viewport.dataset.graphDropBound === "true") {
      return;
    }
    viewport.dataset.graphDropBound = "true";

    const resolveDraggedEntityRef = (dataTransfer: DataTransfer | null | undefined): WMEntityRef | undefined => {
      return this.options.extractDraggedEntityRef(dataTransfer) ?? this.options.getCurrentDraggedEntityRef();
    };

    viewport.addEventListener("dragover", (event) => {
      const ref = resolveDraggedEntityRef(event.dataTransfer);
      const targetPath = viewport.dataset.graphDocumentPath?.trim();
      if (!targetPath || !ref) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      viewport.classList.add("is-graph-drop-target");
    });

    viewport.addEventListener("dragleave", (event) => {
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && viewport.contains(relatedTarget)) {
        return;
      }
      viewport.classList.remove("is-graph-drop-target");
    });

    viewport.addEventListener("drop", (event) => {
      const ref = resolveDraggedEntityRef(event.dataTransfer);
      const targetPath = viewport.dataset.graphDocumentPath?.trim();
      viewport.classList.remove("is-graph-drop-target");
      if (!ref || !targetPath) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.options.clearCurrentDraggedEntityRef();
      void this.options.dispatchDrop({
        targetDocument: {
          path: targetPath,
          kind: "graph-view",
          viewTypeId: "graph",
          pane: paneId,
        },
        refs: [ref],
        sourcePane: this.options.getActivePaneId(),
        clientX: event.clientX,
        clientY: event.clientY,
      });
    });

    viewport.addEventListener("dragend", () => {
      this.options.clearCurrentDraggedEntityRef();
      viewport.classList.remove("is-graph-drop-target");
    });
  }
}
