import { queueGraphDocumentMutation } from "./GraphDocumentMutationQueue";
import type { App, TFile } from "obsidian";
import type { GraphPropertyKeys } from "./GraphPropertyKeys";
import { O3GraphState } from "./O3GraphState";
import { O3GraphStateStore, type O3GraphSimulationSettings } from "./O3GraphStateStore";

export type O3GraphDocumentWriteReason =
  | "badge-expansion"
  | "lens-state"
  | "node-position"
  | "viewport"
  | "link-type-menu"
  | "graph-settings"
  | "note-truth-reconciliation"
  | "clear-graph-data"
  | "manual-migration";

export interface O3GraphDocumentWriteOptions {
  reason: O3GraphDocumentWriteReason;
  forceEmptyOverwrite?: boolean;
  requireExistingBlock?: boolean;
}

export class O3GraphDocumentStore {
  private readonly stateStore: O3GraphStateStore;
  private hydrationDepth = 0;
  private hasHydratedSuccessfully = false;

  constructor(
    private readonly app: App,
    private readonly file: TFile,
    graphPropertyKeys: Partial<GraphPropertyKeys>
  ) {
    this.stateStore = new O3GraphStateStore(app, file, graphPropertyKeys);
  }

  beginHydration(): void {
    this.hydrationDepth += 1;
  }

  endHydration(): void {
    this.hydrationDepth = Math.max(0, this.hydrationDepth - 1);
  }

  async readState(options: { cached?: boolean } = {}): Promise<O3GraphState> {
    const state = await this.stateStore.read(options);
    this.hasHydratedSuccessfully = true;
    return state;
  }

  readSimulationSettings(defaults: O3GraphSimulationSettings): O3GraphSimulationSettings {
    return this.stateStore.readSimulationSettings(defaults);
  }

  async writeSimulationSettings(
    settings: O3GraphSimulationSettings,
    options: O3GraphDocumentWriteOptions
  ): Promise<void> {
    if (!this.shouldAllowWrite(options)) return;
    await this.stateStore.writeSimulationSettings(settings);
  }

  async writeState(
    graphState: O3GraphState,
    options: O3GraphDocumentWriteOptions
  ): Promise<boolean> {
    if (!this.shouldAllowWrite(options)) {
      console.warn("[GraphDocumentStore] Refused graph-state write during hydration.", {
        reason: options.reason
      });
      return false;
    }
    return queueGraphDocumentMutation(this.app, this.file.path, () => this.stateStore.write(graphState, {
      forceEmptyOverwrite: options.forceEmptyOverwrite === true || options.reason === "clear-graph-data",
      requireExistingBlock: options.requireExistingBlock === true,
      allowNodeRemoval: options.reason === "badge-expansion"
        || options.reason === "note-truth-reconciliation"
        || options.reason === "clear-graph-data"
        || options.reason === "manual-migration"
    }));
  }

  private shouldAllowWrite(options: O3GraphDocumentWriteOptions): boolean {
    if (!options?.reason) return false;
    if (!this.hasHydratedSuccessfully && options.reason !== "manual-migration") return false;
    return this.hydrationDepth === 0 || options.reason === "manual-migration";
  }
}
