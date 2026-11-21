export type GraphTabMode = "graph" | "markdown";
export type GraphTabBinding =
  | { kind: "automatic" }
  | { kind: "linked"; sourceTabId: string; labelHint: string; unavailable?: true };

export interface GraphTabNote {
  path: string;
  instanceIds: string[];
}

export interface GraphTabSelection {
  notes: GraphTabNote[];
  preferredPath: string | null;
}

export interface GraphTabSession {
  version: 1;
  sessionId: string;
  mode: GraphTabMode;
  binding: GraphTabBinding;
  graphSourcePath: string | null;
  selection: GraphTabSelection;
  activeMarkdownPath: string | null;
  localSelection: GraphTabSelection;
  automaticGroup: string;
}

export const emptyGraphTabSelection: GraphTabSelection = { notes: [], preferredPath: null };

export function graphTabRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function path(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function graphTabSelection(refs: readonly { path: string; nodeId: string }[], preferredId?: string): GraphTabSelection {
  const notes = new Map<string, Set<string>>();
  let preferredPath: string | null = null;
  for (const ref of refs) {
    if (!ref.path || !ref.nodeId) continue;
    const ids = notes.get(ref.path) ?? new Set<string>();
    ids.add(ref.nodeId);
    notes.set(ref.path, ids);
    if (ref.nodeId === preferredId) preferredPath = ref.path;
  }
  return { notes: Array.from(notes, ([path, ids]) => ({ path, instanceIds: [...ids] })), preferredPath };
}

function readSelection(raw: unknown): GraphTabSelection {
  const selection = graphTabRecord(raw);
  const paths = new Map<string, Set<string>>();
  for (const entry of Array.isArray(selection.notes) ? selection.notes as unknown[] : []) {
    const note = graphTabRecord(entry);
    const key = path(note.path);
    if (!key) continue;
    const ids = paths.get(key) ?? new Set<string>();
    for (const id of Array.isArray(note.instanceIds) ? note.instanceIds as unknown[] : []) {
      if (typeof id === "string" && id) ids.add(id);
    }
    paths.set(key, ids);
  }
  const preferredPath = path(selection.preferredPath);
  return {
    notes: Array.from(paths, ([path, ids]) => ({ path, instanceIds: [...ids] })),
    preferredPath: preferredPath && paths.has(preferredPath) ? preferredPath : null
  };
}

export function readGraphTabSession(state: Record<string, unknown>, mode: GraphTabMode, newId: () => string): GraphTabSession {
  const raw = graphTabRecord(state.graphTabSession);
  const saved = raw.version === 1 && path(raw.sessionId) ? raw : {};
  const binding = graphTabRecord(raw.binding);
  // Invalid linked state fails closed, including a missing exact source ID.
  const root = Object.prototype.hasOwnProperty.call(saved, "graphSourcePath")
    ? path(saved.graphSourcePath) : mode === "graph" ? path(state.file ?? state.filePath) : null;
  return {
    version: 1,
    sessionId: path(saved.sessionId) ?? newId(),
    mode,
    binding: binding.kind === "linked" ? {
      kind: "linked", sourceTabId: path(binding.sourceTabId) ?? "", labelHint: path(binding.labelHint) ?? "",
      ...(binding.unavailable === true && { unavailable: true })
    } : { kind: "automatic" },
    graphSourcePath: root,
    selection: readSelection(saved.selection),
    activeMarkdownPath: path(saved.activeMarkdownPath) ?? (mode === "markdown" ? path(state.file) : null),
    localSelection: readSelection(saved.localSelection),
    automaticGroup: path(saved.automaticGroup) ?? ""
  };
}

export function graphTabMarkdownTarget(
  session: GraphTabSession, canDisplay: (path: string) => boolean
): string | null {
  const { notes, preferredPath } = session.selection;
  if (!notes.length) return session.graphSourcePath && canDisplay(session.graphSourcePath) ? session.graphSourcePath : null;
  const valid = notes.filter(note => canDisplay(note.path));
  return valid.find(note => note.path === session.activeMarkdownPath)?.path
    ?? valid.find(note => note.path === preferredPath)?.path
    ?? valid[0]?.path ?? null;
}

export function canLinkGraphTab(follower: string, source: string, next: (id: string) => string | undefined): boolean {
  if (!source) return false;
  const seen = new Set([follower]);
  for (let id: string | undefined = source; id; id = next(id)) {
    if (seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/** Only the most recent request may commit after a save or graph teardown preparation. */
export class GraphTabTransitions {
  private version = 0;
  private tail = Promise.resolve();

  submit(work: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    const version = ++this.version;
    const isCurrent = () => version === this.version;
    const run = this.tail.then(async () => {
      if (isCurrent()) await work(isCurrent);
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  cancel(): void {
    ++this.version;
  }
}
