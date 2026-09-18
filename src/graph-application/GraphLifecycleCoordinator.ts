import type {
  GraphHostEvent,
  GraphHostEventSource
} from "./ObsidianGraphWatcher";

function getNodeSetTimeout(): typeof setTimeout {
  return setTimeout;
}

function getNodeClearTimeout(): typeof clearTimeout {
  return clearTimeout;
}

export interface GraphLifecycleToken {
  generation: number;
  path: string;
  signal: AbortSignal;
  isCurrent(): boolean;
}

export interface GraphLifecycleCoordinatorOptions {
  now?: () => number;
  onError?: (error: unknown) => void;
}

/**
 * Coordinates document lifetime, host events, delayed work, and async results.
 *
 * Opening a document establishes a generation. Close, rename, delete, and
 * reopen invalidate the previous generation so late promises cannot publish
 * into a different document. Timers, subscriptions, and abort signals are
 * released with the same boundary.
 */
export class GraphLifecycleCoordinator {
  private readonly now: () => number;
  private readonly onError: (error: unknown) => void;
  private generation = 0;
  private activePath: string | null = null;
  private openState = false;
  private readonly timers = new Map<string, number | ReturnType<typeof setTimeout>>();
  private generationController = new AbortController();
  private readonly writeSuppressions = new Map<string, number>();
  private eventSource: GraphHostEventSource | undefined;
  private eventListener: ((event: GraphHostEvent) => void) | undefined;
  private stopEvents: (() => void) | undefined;

  constructor(options: GraphLifecycleCoordinatorOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.onError = options.onError ?? (() => {});
  }

  open(path: string): GraphLifecycleToken | undefined {
    const normalized = normalizePath(path);
    if (!normalized) return undefined;
    this.invalidateAsyncWork();
    this.openState = true;
    this.activePath = normalized;
    if (this.eventSource && this.eventListener) this.startEvents();
    return this.tokenFor(normalized, this.generation);
  }

  reopen(path: string): GraphLifecycleToken | undefined {
    this.close();
    const token = this.open(path);
    if (this.eventSource && this.eventListener && this.openState) {
      this.startEvents();
    }
    return token;
  }

  close(): void {
    this.invalidateAsyncWork();
    this.openState = false;
    this.activePath = null;
    this.writeSuppressions.clear();
    this.stopEvents?.();
    this.stopEvents = undefined;
  }

  isOpen(): boolean {
    return this.openState;
  }

  getActivePath(): string | null {
    return this.activePath;
  }

  getGeneration(): number {
    return this.generation;
  }

  watch(
    source: GraphHostEventSource,
    listener: (event: GraphHostEvent) => void
  ): () => void {
    this.stopEvents?.();
    this.stopEvents = undefined;
    this.eventSource = source;
    this.eventListener = listener;
    if (this.openState) this.startEvents();

    return () => {
      if (this.eventSource !== source || this.eventListener !== listener) return;
      this.stopEvents?.();
      this.stopEvents = undefined;
      this.eventSource = undefined;
      this.eventListener = undefined;
    };
  }

  async run<T>(
    path: string,
    work: (signal: AbortSignal) => Promise<T>
  ): Promise<T | undefined> {
    const token = this.capture(path);
    if (!token) return undefined;
    try {
      const result = await work(token.signal);
      return token.isCurrent() ? result : undefined;
    } catch (error) {
      if (!token.signal.aborted) this.onError(error);
      return undefined;
    }
  }

  async runWrite<T>(
    path: string,
    work: (signal: AbortSignal) => Promise<T>,
    suppressionMs = 1500
  ): Promise<T | undefined> {
    const token = this.capture(path);
    if (!token) return undefined;
    this.suppressWrite(path, suppressionMs);
    try {
      const result = await work(token.signal);
      return token.isCurrent() ? result : undefined;
    } catch (error) {
      if (!token.signal.aborted) this.onError(error);
      return undefined;
    }
  }

  schedule(
    key: string,
    path: string,
    delayMs: number,
    work: (token: GraphLifecycleToken) => void | Promise<void>
  ): void {
    const normalizedKey = String(key ?? "").trim();
    const token = this.capture(path);
    if (!normalizedKey || !token) return;
    const previous = this.timers.get(normalizedKey);
    if (previous !== undefined) this.clearTimer(previous);

    const timer = this.setTimer(() => {
      this.timers.delete(normalizedKey);
      if (!token.isCurrent()) return;
      Promise.resolve(work(token)).catch((error) => this.onError(error));
    }, Math.max(0, Number(delayMs) || 0));
    this.timers.set(normalizedKey, timer);
  }

  cancelScheduled(key: string): void {
    const normalizedKey = String(key ?? "").trim();
    const timer = this.timers.get(normalizedKey);
    if (timer === undefined) return;
    this.clearTimer(timer);
    this.timers.delete(normalizedKey);
  }

  suppressWrite(path: string, durationMs = 1500): void {
    const normalized = normalizePath(path);
    if (!normalized) return;
    this.writeSuppressions.set(normalized, this.now() + Math.max(0, durationMs));
  }

  isWriteSuppressed(path: string): boolean {
    const normalized = normalizePath(path);
    const until = this.writeSuppressions.get(normalized) ?? 0;
    if (!until || this.now() >= until) {
      this.writeSuppressions.delete(normalized);
      return false;
    }
    return true;
  }

  private capture(path: string): GraphLifecycleToken | undefined {
    const normalized = normalizePath(path);
    if (!this.openState || !normalized || normalized !== this.activePath) return undefined;
    return this.tokenFor(normalized, this.generation);
  }

  private tokenFor(path: string, generation: number): GraphLifecycleToken {
    const token: GraphLifecycleToken = {
      generation,
      path,
      signal: this.generationController.signal,
      isCurrent: () =>
        this.openState
        && this.activePath === path
        && this.generation === generation
        && !this.generationController.signal.aborted
    };
    return token;
  }

  private invalidateAsyncWork(): void {
    this.generation += 1;
    this.generationController.abort();
    this.generationController = new AbortController();
    for (const timer of this.timers.values()) this.clearTimer(timer);
    this.timers.clear();
  }

  private setTimer(work: () => void, delayMs: number): number | ReturnType<typeof setTimeout> {
    if (typeof window !== "undefined") return window.setTimeout(work, delayMs);
    return getNodeSetTimeout()(work, delayMs);
  }

  private clearTimer(timer: number | ReturnType<typeof setTimeout>): void {
    if (typeof window !== "undefined") {
      window.clearTimeout(timer as number);
      return;
    }
    getNodeClearTimeout()(timer);
  }

  private startEvents(): void {
    if (this.stopEvents || !this.eventSource || !this.eventListener) return;
    this.stopEvents = this.eventSource.subscribe((event) => this.handleEvent(event));
  }

  private handleEvent(event: GraphHostEvent): void {
    if (!this.openState) return;
    if (this.isSuppressedEvent(event)) return;

    const previousPath = this.activePath;
    const noteChanged = event.type === "note-created"
      || event.type === "note-changed"
      || event.type === "note-renamed"
      || event.type === "note-deleted";
    if (noteChanged) this.invalidateAsyncWork();
    if (event.type === "note-renamed" && this.activePath === event.oldPath) {
      this.activePath = event.path;
    }
    const deletesActive = event.type === "note-deleted" && this.activePath === event.path;
    this.eventListener?.(event);
    if (
      deletesActive
      && previousPath === event.path
      && this.openState
      && this.activePath === event.path
    ) {
      this.close();
    }
  }

  private isSuppressedEvent(event: GraphHostEvent): boolean {
    if (
      event.type === "note-created"
      || event.type === "note-changed"
      || event.type === "note-deleted"
    ) {
      return this.isWriteSuppressed(event.path);
    }
    if (event.type === "note-renamed") {
      return this.isWriteSuppressed(event.path) || this.isWriteSuppressed(event.oldPath);
    }
    return false;
  }
}

function normalizePath(value: unknown): string {
  return String(value ?? "").trim().replace(/\\/g, "/");
}
