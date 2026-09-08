import type { NoteId } from "../graph-domain/graph-identifiers";

export type GraphHostEvent =
  | { type: "note-created"; path: NoteId }
  | { type: "note-changed"; path: NoteId }
  | { type: "note-renamed"; path: NoteId; oldPath: NoteId }
  | { type: "note-deleted"; path: NoteId }
  | { type: "active-note-changed"; path: NoteId | null };

export interface GraphHostEventSource {
  subscribe(listener: (event: GraphHostEvent) => void): () => void;
}

type Unsubscribe = () => void;
type PathHandler = (path: string) => void;
type RenameHandler = (filePath: string, oldPath: string) => void;
type ActiveHandler = (path: string | null) => void;

export interface ObsidianGraphWatcherOptions {
  onCreate(register: PathHandler): Unsubscribe;
  onChange(register: PathHandler): Unsubscribe;
  onRename(register: RenameHandler): Unsubscribe;
  onDelete(register: PathHandler): Unsubscribe;
  onActiveNoteChange(register: ActiveHandler): Unsubscribe;
}

/** Normalizes vault, metadata-cache, and workspace events into graph host events. */
export class ObsidianGraphWatcher implements GraphHostEventSource {
  private readonly listeners = new Set<(event: GraphHostEvent) => void>();
  private stopHostEvents: (() => void) | undefined;

  constructor(private readonly options: ObsidianGraphWatcherOptions) {}

  subscribe(listener: (event: GraphHostEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.startHostEvents();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stopHostEvents?.();
      if (this.listeners.size === 0) this.stopHostEvents = undefined;
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.stopHostEvents?.();
    this.stopHostEvents = undefined;
  }

  private startHostEvents(): void {
    const emitPath = (type: GraphHostEvent["type"]) => (path: string) => {
      const normalized = normalizePath(path);
      if (!normalized) return;
      this.emit(type === "note-created"
        ? { type, path: normalized }
        : type === "note-changed"
          ? { type, path: normalized }
          : { type: "note-deleted", path: normalized });
    };
    const unsubs = [
      this.options.onCreate(emitPath("note-created")),
      this.options.onChange(emitPath("note-changed")),
      this.options.onRename((filePath, oldPath) => {
        const path = normalizePath(filePath);
        const previous = normalizePath(oldPath);
        if (path && previous) this.emit({ type: "note-renamed", path, oldPath: previous });
      }),
      this.options.onDelete(emitPath("note-deleted")),
      this.options.onActiveNoteChange((rawPath) => {
        const path = normalizePath(rawPath);
        this.emit({ type: "active-note-changed", path: path || null });
      })
    ];
    this.stopHostEvents = () => {
      for (const unsubscribe of unsubs) unsubscribe();
    };
  }

  private emit(event: GraphHostEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function normalizePath(value: unknown): string {
  return String(value ?? "").trim().replace(/\\/g, "/");
}
