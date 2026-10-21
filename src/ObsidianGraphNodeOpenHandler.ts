/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Obsidian workspace APIs return cross-plugin objects whose runtime type is checked before opening files. */
import { TFile, type App, type WorkspaceLeaf } from "obsidian";
import type { GraphNodeOpenRequest } from "./GraphEngine";
import { resolveGraphNodeOpenRoute } from "./GraphNodeOpenRouting";

export interface ObsidianGraphNodeOpenHandlerOptions {
  sourceLeaf: WorkspaceLeaf;
  isGraphCapable(path: string): boolean | Promise<boolean>;
  openGraphInLeaf(leaf: WorkspaceLeaf, path: string): void | Promise<void>;
  graphTab?: boolean;
  openMarkdownFromGraphTab?(graphLeaf: WorkspaceLeaf, path: string): void | Promise<void>;
}

export class ObsidianGraphNodeOpenHandler {
  constructor(
    private readonly app: App,
    private readonly options?: ObsidianGraphNodeOpenHandlerOptions
  ) {}

  async openNode(request: GraphNodeOpenRequest): Promise<void> {
    const target = this.app.vault.getAbstractFileByPath(request.path);
    if (!(target instanceof TFile)) return;

    if (!this.options) {
      const leaf = this.app.workspace.getLeaf(request.newTab ? "tab" : false);
      await leaf.openFile(target, { active: true });
      return;
    }

    const sourceLeaf = this.options.sourceLeaf;
    const route = resolveGraphNodeOpenRoute({
      graphCapable: await this.options.isGraphCapable(target.path),
      graphTab: this.options.graphTab === true,
      newTab: request.newTab,
      sourcePinned: sourceLeaf.getViewState().pinned === true
    });

    if (route === "source-graph") {
      await sourceLeaf.openFile(target, { active: true });
      return;
    }

    if (route === "graph-tab-markdown" && this.options.openMarkdownFromGraphTab) {
      await this.options.openMarkdownFromGraphTab(sourceLeaf, target.path);
      return;
    }

    if (route === "unpinned-graph") {
      const leaf = this.resolveUnpinnedDestination(sourceLeaf);
      await this.options.openGraphInLeaf(leaf, target.path);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      return;
    }

    const leaf = route === "source-markdown"
      ? sourceLeaf
      : route === "unpinned-markdown"
        ? this.resolveUnpinnedDestination(sourceLeaf)
        : this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: "markdown",
      state: { file: target.path },
      active: true
    }, true);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private resolveUnpinnedDestination(sourceLeaf: WorkspaceLeaf): WorkspaceLeaf {
    const leaf = this.app.workspace.getLeaf(false);
    return leaf === sourceLeaf && sourceLeaf.getViewState().pinned === true
      ? this.app.workspace.getLeaf("tab")
      : leaf;
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Re-enable Obsidian workspace API lint rules after this adapter. */
