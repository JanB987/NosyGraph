import { TFile, type App } from "obsidian";
import type { GraphNodeOpenRequest } from "./GraphEngine";

export class ObsidianGraphNodeOpenHandler {
  constructor(private readonly app: App) {}

  async openNode(request: GraphNodeOpenRequest): Promise<void> {
    const target = this.app.vault.getAbstractFileByPath(request.path);
    if (!(target instanceof TFile)) return;

    const leaf = this.app.workspace.getLeaf(request.newTab ? "tab" : false);
    await leaf.openFile(target, { active: true });
  }
}
