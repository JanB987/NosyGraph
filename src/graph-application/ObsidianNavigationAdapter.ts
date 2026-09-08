import type { NoteId } from "../graph-domain/graph-identifiers";

export interface GraphHoverPreviewRequest {
  sourcePath?: string;
  targetPath: NoteId;
  event?: unknown;
}

export interface GraphNavigationPort {
  openNote(path: NoteId, newTab?: boolean): Promise<GraphNavigationResult>;
  revealNote(path: NoteId): Promise<GraphNavigationResult>;
  showHoverPreview(request: GraphHoverPreviewRequest): Promise<GraphNavigationResult>;
}

export interface GraphNavigationResult {
  handled: boolean;
  path: string;
  reason?: "path-invalid" | "target-missing" | "navigation-unavailable";
}

export interface ObsidianNavigationAdapterOptions {
  open(path: string, newTab: boolean): void | Promise<void>;
  reveal(path: string): void | Promise<void>;
  hover(request: GraphHoverPreviewRequest): void | Promise<void>;
  exists?(path: string): boolean | Promise<boolean>;
}

/** Keeps note opening, reveal, and hover-preview calls behind a host-neutral port. */
export class ObsidianNavigationAdapter implements GraphNavigationPort {
  constructor(private readonly options: ObsidianNavigationAdapterOptions) {}

  openNote(path: NoteId, newTab = false): Promise<GraphNavigationResult> {
    return this.execute(path, () => this.options.open(normalizePath(path), newTab));
  }

  revealNote(path: NoteId): Promise<GraphNavigationResult> {
    return this.execute(path, () => this.options.reveal(normalizePath(path)));
  }

  showHoverPreview(request: GraphHoverPreviewRequest): Promise<GraphNavigationResult> {
    const path = normalizePath(request.targetPath);
    if (!path) return Promise.resolve({ handled: false, path, reason: "path-invalid" });
    return this.execute(path, () => this.options.hover({ ...request, targetPath: path }));
  }

  private async execute(
    rawPath: string,
    action: () => void | Promise<void>
  ): Promise<GraphNavigationResult> {
    const path = normalizePath(rawPath);
    if (!path) return { handled: false, path, reason: "path-invalid" };
    if (this.options.exists && !(await this.options.exists(path))) {
      return { handled: false, path, reason: "target-missing" };
    }
    try {
      await action();
      return { handled: true, path };
    } catch {
      return { handled: false, path, reason: "navigation-unavailable" };
    }
  }
}

function normalizePath(value: unknown): string {
  return String(value ?? "").trim().replace(/\\/g, "/");
}
