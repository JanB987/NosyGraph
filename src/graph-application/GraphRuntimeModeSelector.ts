import type { GraphRuntimeMode, GraphRuntimeState } from "./GraphRuntimeState";

export interface GraphRuntimeHandle {
  readonly mode: GraphRuntimeMode;
  readonly path: string;
  readonly state: GraphRuntimeState;
  close(): Promise<void> | void;
}

export interface GraphRuntimeModeFactories {
  createLegacy(path: string): Promise<GraphRuntimeHandle> | GraphRuntimeHandle;
  createStore(path: string): Promise<GraphRuntimeHandle> | GraphRuntimeHandle;
}

export interface GraphRuntimeModeSelectorOptions {
  /** Store mode is opt-in for a trial; legacy remains the default. */
  storeTrialEnabled?: boolean;
  defaultMode?: GraphRuntimeMode;
  factories: GraphRuntimeModeFactories;
  onError?: (error: unknown) => void;
}

export type GraphRuntimeModeOpenResult =
  | { ok: true; handle: GraphRuntimeHandle }
  | {
      ok: false;
      reason:
        | "invalid-path"
        | "store-trial-disabled"
        | "runtime-already-open"
        | "factory-mode-mismatch"
        | "factory-failed";
      mode?: GraphRuntimeMode;
      path: string;
      error?: unknown;
    };

/**
 * Selects one runtime implementation when a graph is created.
 *
 * Store mode is deliberately guarded and cannot be selected unless the caller
 * enables the explicit trial flag. An active graph never changes mode. Rollback
 * closes the active handle first and creates a new legacy handle from the
 * caller's legacy factory, so no mutable state is synchronized between modes.
 */
export class GraphRuntimeModeSelector {
  private readonly storeTrialEnabled: boolean;
  private readonly defaultMode: GraphRuntimeMode;
  private readonly factories: GraphRuntimeModeFactories;
  private readonly onError: (error: unknown) => void;
  private active?: GraphRuntimeHandle;

  constructor(options: GraphRuntimeModeSelectorOptions) {
    this.storeTrialEnabled = options.storeTrialEnabled === true;
    this.defaultMode = options.defaultMode ?? "legacy";
    this.factories = options.factories;
    this.onError = options.onError ?? (() => {});
    if (this.defaultMode === "store" && !this.storeTrialEnabled) {
      throw new Error("Store runtime trials must be explicitly enabled.");
    }
  }

  getActive(): GraphRuntimeHandle | undefined {
    return this.active;
  }

  async open(path: string, requestedMode: GraphRuntimeMode = this.defaultMode): Promise<GraphRuntimeModeOpenResult> {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) return { ok: false, reason: "invalid-path", path: normalizedPath };
    if (this.active) {
      return {
        ok: false,
        reason: "runtime-already-open",
        mode: this.active.mode,
        path: normalizedPath
      };
    }
    if (requestedMode === "store" && !this.storeTrialEnabled) {
      return {
        ok: false,
        reason: "store-trial-disabled",
        mode: requestedMode,
        path: normalizedPath
      };
    }

    const factory = requestedMode === "store"
      ? this.factories.createStore
      : this.factories.createLegacy;
    let handle: GraphRuntimeHandle;
    try {
      handle = await factory(normalizedPath);
    } catch (error) {
      this.onError(error);
      return {
        ok: false,
        reason: "factory-failed",
        mode: requestedMode,
        path: normalizedPath,
        error
      };
    }
    if (handle.mode !== requestedMode || normalizePath(handle.path) !== normalizedPath) {
      try { await handle.close(); } catch (error) { this.onError(error); }
      return {
        ok: false,
        reason: "factory-mode-mismatch",
        mode: requestedMode,
        path: normalizedPath
      };
    }
    this.active = handle;
    return { ok: true, handle };
  }

  async rollbackToLegacy(path?: string): Promise<GraphRuntimeModeOpenResult> {
    const rollbackPath = normalizePath(path ?? this.active?.path ?? "");
    if (!rollbackPath) return { ok: false, reason: "invalid-path", path: rollbackPath };
    await this.close();
    return this.open(rollbackPath, "legacy");
  }

  async close(): Promise<void> {
    const active = this.active;
    this.active = undefined;
    if (!active) return;
    try {
      await active.close();
    } catch (error) {
      this.onError(error);
      throw error;
    }
  }
}

function normalizePath(value: unknown): string {
  return String(value ?? "").trim().replace(/\\/g, "/");
}